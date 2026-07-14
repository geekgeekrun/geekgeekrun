import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { createSupervisorApi, createSupervisorDiagnostics } from '../lib/supervisor-api.mjs'
import { createSupervisorRpcServer } from '../lib/rpc-server.mjs'

function delay() { return new Promise((resolve) => setImmediate(resolve)) }

{
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-diagnostics-'))
  const filePath = path.join(directory, 'supervisor.jsonl')
  const diagnostics = await createSupervisorDiagnostics({ filePath, maxBytes: 1 })
  try {
    await diagnostics.write('info', 'update.started', { correlationId: 'operation-1', token: 'do-not-log', nested: { password: 'do-not-log' } })
    await diagnostics.write('info', 'update.finished', { correlationId: 'operation-1' })
    const active = await fs.readFile(filePath, 'utf8')
    const rotated = await fs.readFile(`${filePath}.1`, 'utf8')
    assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600)
    assert.equal((await fs.stat(`${filePath}.1`)).mode & 0o777, 0o600)
    assert.match(rotated, /"correlationId":"operation-1"/)
    assert.doesNotMatch(rotated, /do-not-log/)
    assert.match(active, /update.finished/)
  } finally {
    await diagnostics.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const calls = []
const versionStore = {
  async current() { return '1.0.0' },
  async previous() { return '0.9.0' },
  async rollback() { calls.push('rollback'); return '0.9.0' }
}
const processManager = {
  async activateCandidate(version) { calls.push(['activate', version]); return { version } },
  async stop() { calls.push('stop') },
  status() { return { state: 'running' } }
}
const managerFailure = { code: 'BACKEND_CRASHED', version: '0.9.0' }
const managerRollback = { automatic: true, failedVersion: '1.0.0', restoredVersion: '0.9.0' }
const managerStatusApi = createSupervisorApi({
  versionStore,
  processManager: { ...processManager, status: () => ({ state: 'quarantined', lastFailure: managerFailure, rollback: managerRollback }) }
})
const managerStatus = await managerStatusApi.dispatch({ id: 'manager-status', method: 'supervisor.status', params: {} })
assert.deepEqual(managerStatus.lastFailure, managerFailure, 'manager failure is visible before any API-local failure')
assert.deepEqual(managerStatus.rollback, managerRollback)
assert.equal(managerStatus.state, 'quarantined')

{
  let current = null
  const firstInstallApi = createSupervisorApi({
    versionStore: {
      async current() { return current },
      async previous() { return null },
      async rollback() { throw new Error('no rollback') }
    },
    processManager: {
      async activateCandidate(version) { current = version; return { version, health: { ready: true } } },
      async stop() {}, async start() {}, status() { return { state: 'stopped' } }
    },
    backendClient: { async request() { throw new Error('first install must not query or drain a nonexistent backend') } },
    installer: async ({ manifest }) => ({ version: manifest.version })
  })
  const installed = await firstInstallApi.dispatch({ id: 'first-install', method: 'update.install', params: { manifest: { version: '1.0.0' }, deadlineMs: 100 } })
  assert.equal(installed.health.ready, true)
  assert.equal(current, '1.0.0', 'first install activates and health-checks the staged backend')
}
let cancelled = false
const backendClient = {
  async request(method, params) {
    calls.push([method, params])
    if (method === 'task.list') return cancelled ? [] : [{ workerId: 'w1', status: 'running', runtimeStorage: { stepStatusMapByStepId: { safe: { step: { status: 'pending' } } } } }]
    if (method === 'task.stop') cancelled = true
    return { accepted: true }
  }
}
let installs = 0
let concurrentInstalls = 0
let maxConcurrentInstalls = 0
let clock = 0
const api = createSupervisorApi({
  versionStore, processManager, backendClient,
  installer: async ({ manifest }) => { installs++; concurrentInstalls++; maxConcurrentInstalls = Math.max(maxConcurrentInstalls, concurrentInstalls); await delay(); concurrentInstalls--; return { version: manifest.version } },
  now: () => clock,
  sleep: async () => { clock += 50; await delay() }
})

const first = api.dispatch({ id: 'install-1', method: 'update.install', params: { manifest: { version: '2.0.0' }, deadlineMs: 100 } })
const second = api.dispatch({ id: 'install-2', method: 'update.install', params: { manifest: { version: '3.0.0' }, deadlineMs: 100, cancelRunningTasks: true } })
await assert.rejects(first, { code: 'TASKS_ACTIVE' })
await second
assert.equal(installs, 2)
assert.equal(maxConcurrentInstalls, 1, 'concurrent install requests are serialized')
assert.deepEqual(calls.slice(0, 2), [
  ['task.list', {}],
  ['system.updateDrain', { enabled: true }]
])
assert.deepEqual(calls.find(([method]) => method === 'task.stop'), ['task.stop', { workerId: 'w1' }])
assert.deepEqual(calls.at(-1), ['activate', '3.0.0'])
const status = await api.dispatch({ id: 'status', method: 'supervisor.status', params: {} })
assert.deepEqual(Object.keys(status).sort(), ['candidate', 'current', 'lastFailure', 'previous', 'progress', 'rollback', 'state'])

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-supervisor-rpc-'))
const socketPath = path.join(directory, 'supervisor.sock')
const rpc = createSupervisorRpcServer({ socketPath, api, logger: { write: async () => {} } })
try {
  await rpc.start()
  assert.equal((await fs.stat(socketPath)).mode & 0o777, 0o600)
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let data = ''
    socket.setEncoding('utf8')
    socket.once('error', reject)
    socket.on('data', (chunk) => {
      data += chunk
      if (data.includes('\n')) { socket.end(); resolve(JSON.parse(data.trim())) }
    })
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 'health', method: 'supervisor.status', params: {} })}\n`))
  })
  assert.equal(response.result.current, '1.0.0')
} finally {
  await rpc.stop()
  await fs.rm(directory, { recursive: true, force: true })
}

console.log('ggrd supervisor API check passed')
