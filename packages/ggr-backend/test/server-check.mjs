import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createGgrClient } from '@geekgeekrun/ggr-client'
import { createBackendServer } from '../server.mjs'
import { createRuntimePaths } from '../lib/runtime-paths.mjs'
import { createConfigService } from '../lib/services/config-service.mjs'
import { createLogger } from '../lib/logger.mjs'

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-'))
const runtimePaths = createRuntimePaths(tempHome)
await fs.mkdir(runtimePaths.storageDir, { recursive: true })
await fs.writeFile(path.join(runtimePaths.storageDir, 'hr-reply-approval-queue.json'), JSON.stringify([
  { id: 'approval-one', status: 'pending' },
  { id: 'approval-two', status: 'pending' }
]))
const taskChildren = []
const backend = await createBackendServer({
  socketPath: runtimePaths.backendSocket,
  version: '0.1.0',
  runtimePaths,
  services: {
    workerEntries: { auto: '/tmp/auto.mjs' },
    spawnProcess: () => {
      const child = new EventEmitter()
      child.pid = 700 + taskChildren.length
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = (signal) => { queueMicrotask(() => child.emit('exit', null, signal)); return true }
      taskChildren.push(child)
      return child
    },
    stopTimeoutMs: 10
  }
})

try {
  await backend.start()
  const client = createGgrClient({
    socketPath: runtimePaths.backendSocket,
    client: 'test',
    clientVersion: '1.0.0'
  })
  await client.connect()
  const events = []
  client.onEvent((event) => events.push(event))

  assert.deepEqual(await client.request('system.health'), {
    ready: true,
    version: '0.1.0',
    protocolVersion: 1
  })
  await client.request('config.write', {
    resource: 'opening_message',
    patch: { openingMessage: 'hello', nested: { password: 'hidden', safe: 'shown' } }
  })
  const config = await client.request('config.read', { resource: 'opening_message' })
  assert.equal(config.data.openingMessage, 'hello')
  assert.equal(config.data.nested.password, '[redacted]')
  assert.equal(config.data.nested.safe, 'shown')
  assert.equal((await fs.stat(path.join(runtimePaths.configDir, 'boss.json'))).mode & 0o777, 0o600)

  for (const resource of ['../boss.json', 'boss.json', '/tmp/boss.json']) {
    await assert.rejects(client.request('config.read', { resource }), { code: 'INVALID_PARAMS' })
  }
  await assert.rejects(
    client.request('config.write', { resource: 'runtime_status', patch: {} }),
    { code: 'INVALID_PARAMS' }
  )

  assert.deepEqual(await client.request('task.list'), [])
  for (const forbidden of ['command', 'args', 'cwd', 'env']) {
    await assert.rejects(
      client.request('task.start', { workerId: 'auto', [forbidden]: 'forbidden' }),
      { code: 'INVALID_PARAMS' }
    )
  }
  await assert.rejects(
    client.request('task.start', { workerId: 'auto', options: { command: '/bin/sh' } }),
    { code: 'INVALID_PARAMS' }
  )
  const task = await client.request('task.start', { workerId: 'auto' })
  assert.equal(task.pid, 700)
  taskChildren[0].stdout.emit('data', 'token=do-not-log\nready\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((await client.request('task.list'))[0].recentStdout[0], 'token=[redacted]')
  assert(events.some(({ event, data }) => event === 'task.progress' && data.line === 'token=[redacted]'))
  await client.request('task.stop', { workerId: 'auto' })
  assert(events.some(({ event }) => event === 'task.exited'))

  assert.equal((await client.request('approval.list')).length, 2)
  assert.equal((await client.request('approval.approve', { id: 'approval-one' })).status, 'approved_auto_reply')
  assert.equal((await client.request('approval.requireHuman', { id: 'approval-two', reason: 'review' })).status, 'human_required')
  assert(events.some(({ event, data }) => event === 'approval.required' && data.id === 'approval-two'))

  await client.close()
  await backend.stop()
  await assert.rejects(fs.lstat(runtimePaths.backendSocket), { code: 'ENOENT' })

  const log = await fs.readFile(runtimePaths.backendLog, 'utf8')
  const records = log.trim().split('\n').map(JSON.parse)
  assert(records.some(({ correlationId }) => typeof correlationId === 'string' && correlationId.length > 0))
  assert(!log.includes('hidden'))
  assert(!log.includes('do-not-log'))
  assert.equal((await fs.stat(runtimePaths.backendLog)).mode & 0o777, 0o600)

} finally {
  await backend.stop().catch(() => {})
  await fs.rm(tempHome, { recursive: true, force: true })
}

{
  const logHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-logger-concurrency-'))
  const logPath = path.join(logHome, 'backend.jsonl')
  const logger = await createLogger({ filePath: logPath, maxBytes: 180 })
  try {
    await logger.write('info', 'prefill', { value: 'x'.repeat(80) })
    const settled = await Promise.allSettled([
      logger.write('info', 'concurrent-one', { value: 'a'.repeat(80) }),
      logger.write('info', 'concurrent-two', { value: 'b'.repeat(80) })
    ])
    assert(settled.every(({ status }) => status === 'fulfilled'))
    await logger.close()
    for (const target of [logPath, `${logPath}.1`]) {
      const content = await fs.readFile(target, 'utf8')
      for (const line of content.trim().split('\n').filter(Boolean)) JSON.parse(line)
      assert.equal((await fs.stat(target)).mode & 0o777, 0o600)
    }
  } finally {
    await logger.close().catch(() => {})
    await fs.rm(logHome, { recursive: true, force: true })
  }
}

{
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-config-concurrency-'))
  const service = createConfigService({ configDir: configHome })
  try {
    await Promise.all([
      service.write({ resource: 'opening_message', patch: { openingMessage: 'one' } }),
      service.write({ resource: 'reply_policy', patch: { replyPolicy: 'two' } })
    ])
    const data = JSON.parse(await fs.readFile(path.join(configHome, 'boss.json'), 'utf8'))
    assert.deepEqual(data, { openingMessage: 'one', replyPolicy: 'two' })
  } finally {
    await fs.rm(configHome, { recursive: true, force: true })
  }
}

{
  const delayedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-peer-'))
  const paths = createRuntimePaths(delayedHome)
  const delayedBackend = await createBackendServer({
    socketPath: paths.backendSocket,
    version: '0.1.0',
    runtimePaths: paths,
    verifyPeer: () => new Promise((resolve) => setTimeout(() => resolve(true), 30))
  })
  try {
    await delayedBackend.start()
    const client = createGgrClient({ socketPath: paths.backendSocket, client: 'test', clientVersion: '1.0.0', requestTimeoutMs: 200 })
    await client.connect()
    await client.close()
  } finally {
    await delayedBackend.stop()
    await fs.rm(delayedHome, { recursive: true, force: true })
  }
}

console.log('ggr backend server check passed')
