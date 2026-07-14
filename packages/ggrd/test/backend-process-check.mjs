import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import path from 'node:path'

import { createBackendProcessManager } from '../lib/backend-process.mjs'

function child(pid) {
  const process = new EventEmitter()
  process.pid = pid
  process.killed = false
  process.kill = () => { process.killed = true }
  return process
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail('condition was not reached')
}

function store() {
  let current = '1.0.0'
  let previous = '0.9.0'
  const activations = []
  let rollbacks = 0
  return {
    runtimeDir: '/safe/runtime', versionsDir: '/safe/runtime/versions',
    async current() { return current },
    async previous() { return previous },
    async activate(version) { activations.push(version); previous = current; current = version },
    async rollback() { rollbacks++; [current, previous] = [previous, current]; return current },
    get activations() { return activations },
    get rollbacks() { return rollbacks }
  }
}

{
  const versionStore = store()
  const spawned = []
  const manager = createBackendProcessManager({
    versionStore,
    backendSocketPath: '/safe/runtime/run/backend.sock',
    supervisorPath: '/safe/runtime/run/supervisor.sock',
    executablePath: '/safe/bin',
    spawnProcess(command, args, options) {
      const result = child(spawned.length + 100)
      spawned.push({ command, args, options, result })
      return result
    },
    healthCheck: async ({ version }) => version === '1.0.0',
    now: () => 1000
  })

  await assert.rejects(manager.activateCandidate('2.0.0'), { code: 'HEALTH_CHECK_FAILED' })
  assert.deepEqual(versionStore.activations, ['2.0.0'])
  assert.equal(versionStore.rollbacks, 1, 'failed readiness restores the previous pointer')
  assert.deepEqual(
    spawned.map(({ command, args, options }) => ({ command, args, env: options.env })),
    [
      {
        command: path.join('/safe/runtime/versions', '2.0.0', 'bin', 'node'),
        args: [path.join('/safe/runtime/versions', '2.0.0', 'app', 'server.mjs')],
        env: {
          GGR_RUNTIME_DIR: '/safe/runtime',
          GGR_BACKEND_SOCKET: '/safe/runtime/run/backend.sock',
          GGR_SUPERVISOR_SOCKET: '/safe/runtime/run/supervisor.sock',
          GGR_BACKEND_VERSION: '2.0.0',
          PATH: '/safe/bin'
        }
      },
      {
        command: path.join('/safe/runtime/versions', '1.0.0', 'bin', 'node'),
        args: [path.join('/safe/runtime/versions', '1.0.0', 'app', 'server.mjs')],
        env: {
          GGR_RUNTIME_DIR: '/safe/runtime',
          GGR_BACKEND_SOCKET: '/safe/runtime/run/backend.sock',
          GGR_SUPERVISOR_SOCKET: '/safe/runtime/run/supervisor.sock',
          GGR_BACKEND_VERSION: '1.0.0',
          PATH: '/safe/bin'
        }
      }
    ]
  )
  assert.equal(spawned.some(({ options }) => Object.hasOwn(options.env, 'HOME') || Object.hasOwn(options.env, 'TOKEN')), false)
}

{
  const versionStore = store()
  const diagnostics = []
  const spawned = []
  let clock = 0
  const manager = createBackendProcessManager({
    versionStore,
    spawnProcess() { const result = child(spawned.length + 200); spawned.push(result); return result },
    healthCheck: async () => true,
    diagnostic: (record) => diagnostics.push(record),
    now: () => clock,
    crashPolicy: { maxCrashes: 3, windowMs: 60_000 }
  })

  await manager.start('1.0.0')
  for (let index = 0; index < 3; index++) {
    clock += 10_000
    spawned.at(-1).emit('exit', 1, null)
    await new Promise((resolve) => setImmediate(resolve))
  }
  await waitFor(() => versionStore.rollbacks === 1)
  assert.equal(versionStore.rollbacks, 1, 'a crash loop rolls back exactly once')
  assert.equal(diagnostics.filter(({ event }) => event === 'backend.crash_loop_rollback').length, 1)
  assert.deepEqual(manager.status().rollback, { automatic: true, failedVersion: '1.0.0', restoredVersion: '0.9.0' })
  assert.equal(await versionStore.current(), '0.9.0')
  spawned.at(-1).emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(versionStore.rollbacks, 1, 'the failed version is never selected again automatically')

  await manager.stop()
  const recordsBefore = diagnostics.length
  spawned.at(-1).emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(diagnostics.length, recordsBefore, 'a user-requested stop is not a crash')
}

console.log('ggrd backend process check passed')
