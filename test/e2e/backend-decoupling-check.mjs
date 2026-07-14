import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'

import { createGgrClient } from '../../packages/ggr-client/index.mjs'
import { createBackendProcessManager } from '../../packages/ggrd/lib/backend-process.mjs'
import { createSupervisorApi, createSupervisorDiagnostics } from '../../packages/ggrd/lib/supervisor-api.mjs'
import { createSupervisorRpcServer } from '../../packages/ggrd/lib/rpc-server.mjs'
import { createVersionStore } from '../../packages/ggrd/lib/version-store.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function stageArtifact(store, version) {
  await store.stage(version, async (directory) => {
    await fs.mkdir(path.join(directory, 'bin'), { recursive: true })
    await fs.mkdir(path.join(directory, 'app'), { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(directory, 'bin', 'node'), '#!/bin/sh\n'),
      fs.writeFile(path.join(directory, 'app', 'server.mjs'), 'export {}\n')
    ])
  })
}

const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-decoupling-'))
const socketPath = path.join(runtimeDir, 'run', 'supervisor.sock')
const store = createVersionStore(runtimeDir)
const data = {
  config: { theme: 'night' },
  records: [{ id: 'record-1' }],
  tasks: []
}

await stageArtifact(store, '1.0.0')
await store.activate('1.0.0')

const backendClient = {
  async request(method, params = {}) {
    if (method === 'task.list') return structuredClone(data.tasks)
    if (method === 'system.updateDrain') return { accepted: true }
    if (method === 'config.read') return structuredClone(data.config)
    if (method === 'config.write') {
      data.config = structuredClone(params.value)
      return { saved: true }
    }
    if (method === 'records.list') return structuredClone(data.records)
    if (method === 'system.health') {
      const version = await store.current()
      return { ready: version !== '1.0.2', version }
    }
    throw Object.assign(new Error(`Unsupported backend request: ${method}`), { code: 'METHOD_NOT_FOUND' })
  }
}

let nextPid = 1000
const processManager = createBackendProcessManager({
  versionStore: store,
  runtimeDir,
  spawnProcess() {
    const child = new EventEmitter()
    child.pid = ++nextPid
    child.kill = () => { queueMicrotask(() => child.emit('exit', 0, 'SIGTERM')); return true }
    return child
  },
  healthCheck: () => backendClient.request('system.health'),
  stopTimeoutMs: 100,
  killTimeoutMs: 100
})

const diagnostics = await createSupervisorDiagnostics({ filePath: path.join(runtimeDir, 'logs', 'supervisor.jsonl') })
const api = createSupervisorApi({
  versionStore: store,
  processManager,
  backendClient,
  diagnostics,
  installer: async ({ manifest }) => {
    await stageArtifact(store, manifest.version)
    return { version: manifest.version }
  }
})
const supervisor = createSupervisorRpcServer({ socketPath, api, logger: diagnostics })

function connect(client) {
  return createGgrClient({ socketPath, client, clientVersion: '1.0.0', protocolVersion: 1 })
}

const electron = connect('fake-electron')
const mcp = connect('fake-mcp')
try {
  await supervisor.start()
  await processManager.start('1.0.0')
  await Promise.all([electron.connect(), mcp.connect()])

  assert.deepEqual(await backendClient.request('config.read'), { theme: 'night' })
  assert.deepEqual(await backendClient.request('records.list'), [{ id: 'record-1' }])
  assert.deepEqual(await backendClient.request('task.list'), [])
  await backendClient.request('config.write', { value: { theme: 'night', preserved: true } })

  await electron.request('update.install', { manifest: { version: '1.0.1' }, deadlineMs: 1_000 })
  assert.equal((await electron.request('supervisor.status')).current, '1.0.1')
  assert.equal((await mcp.request('supervisor.status')).current, '1.0.1')
  assert.equal(processManager.status().activeVersion, '1.0.1')
  assert.deepEqual(await backendClient.request('config.read'), { theme: 'night', preserved: true })
  assert.deepEqual(await backendClient.request('records.list'), [{ id: 'record-1' }])
  assert.deepEqual(await backendClient.request('task.list'), [])

  await assert.rejects(
    electron.request('update.install', { manifest: { version: '1.0.2' }, deadlineMs: 1_000 }),
    { code: 'INTERNAL_ERROR' }
  )
  assert.equal((await electron.request('supervisor.status')).current, '1.0.1', 'unhealthy candidate must roll back')
  assert.equal((await mcp.request('supervisor.status')).current, '1.0.1')
  assert.equal(processManager.status().activeVersion, '1.0.1', 'rollback must restart the previous backend')
  assert.deepEqual(await backendClient.request('config.read'), { theme: 'night', preserved: true }, 'rollback must not alter config data')
  assert.deepEqual(await backendClient.request('records.list'), [{ id: 'record-1' }], 'rollback must preserve records')
  assert.deepEqual(await backendClient.request('task.list'), [], 'rollback must preserve task status')

  const uiPackage = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'))
  const uiDependencies = { ...uiPackage.dependencies, ...uiPackage.devDependencies }
  for (const dependency of [
    '@geekgeekrun/pm', '@geekgeekrun/sqlite-plugin', '@geekgeekrun/puppeteer-extra-plugin-laodeng',
    '@geekgeekrun/geek-auto-start-chat-with-boss', 'puppeteer', 'puppeteer-extra-plugin-stealth', '@puppeteer/browsers'
  ]) {
    assert.equal(uiDependencies[dependency], undefined, `Electron must not package backend dependency ${dependency}`)
  }
} finally {
  await Promise.allSettled([electron.close(), mcp.close()])
  await supervisor.stop()
  await diagnostics.close()
  await fs.rm(runtimeDir, { recursive: true, force: true })
}

console.log('backend decoupling e2e check passed')
