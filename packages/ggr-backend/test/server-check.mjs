import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createGgrClient } from '@geekgeekrun/ggr-client'
import { createBackendServer } from '../server.mjs'
import { createRuntimePaths } from '../lib/runtime-paths.mjs'

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-'))
const runtimePaths = createRuntimePaths(tempHome)
const backend = await createBackendServer({
  socketPath: runtimePaths.backendSocket,
  version: '0.1.0',
  runtimePaths
})

try {
  await backend.start()
  const client = createGgrClient({
    socketPath: runtimePaths.backendSocket,
    client: 'test',
    clientVersion: '1.0.0'
  })
  await client.connect()

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

  await client.close()
  await backend.stop()
  await assert.rejects(fs.lstat(runtimePaths.backendSocket), { code: 'ENOENT' })

  const log = await fs.readFile(runtimePaths.backendLog, 'utf8')
  const records = log.trim().split('\n').map(JSON.parse)
  assert(records.some(({ correlationId }) => typeof correlationId === 'string' && correlationId.length > 0))
  assert(!log.includes('hidden'))
  assert.equal((await fs.stat(runtimePaths.backendLog)).mode & 0o777, 0o600)

  console.log('ggr backend server check passed')
} finally {
  await backend.stop().catch(() => {})
  await fs.rm(tempHome, { recursive: true, force: true })
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
