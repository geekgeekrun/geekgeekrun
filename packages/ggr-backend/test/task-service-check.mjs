import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createApprovalService } from '../lib/services/approval-service.mjs'
import { createTaskService } from '../lib/services/task-service.mjs'
import { createWorkerReporter } from '../lib/workers/worker-reporter.mjs'

function fakeChild(pid, { exitOnSignal = true } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.killSignals = []
  child.kill = (signal) => {
    child.killSignals.push(signal)
    if (exitOnSignal || signal === 'SIGKILL') queueMicrotask(() => child.emit('exit', null, signal))
    return true
  }
  return child
}

{
  const events = []
  const child = fakeChild(99)
  const service = createTaskService({
    spawnProcess: () => child,
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: (event, data) => events.push({ event, data })
  })
  await service.start({ workerId: 'auto' })
  const reporter = createWorkerReporter({ write: (line) => child.stdout.emit('data', line) })
  reporter.emit('task.progress', { workerId: 'auto', state: 'working', token: 'a"b' })
  assert.deepEqual(events[0], { event: 'task.progress', data: { workerId: 'auto', state: 'working', token: '[redacted]' } })
  assert.deepEqual(service.list()[0].recentStdout, [])
  child.stdout.emit('data', '{"ggrWorkerEvent":1,"event":"not.allowed","data":{"password":"nope"}}\n')
  assert.equal(service.list()[0].recentStdout[0], '{"ggrWorkerEvent":1,"event":"not.allowed","data":{"password":"[redacted]"}}')
  await service.stop({ workerId: 'auto' })
}

{
  const events = []
  const child = fakeChild(100, { exitOnSignal: false })
  const service = createTaskService({
    spawnProcess: () => child,
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: (event, data) => events.push({ event, data }),
    diagnosticLineBytes: 64,
    diagnosticStreamBytes: 256
  })
  await service.start({ workerId: 'auto' })
  child.stdout.emit('data', 'token="unclosed-secret-value\n')
  child.stdout.emit('data', 'password=unquoted-secret-value\n')
  child.stdout.emit('data', 'to')
  child.stdout.emit('data', 'ken="split-secret-value"\n')

  const running = JSON.stringify(service.list())
  assert(!running.includes('unclosed-secret'))
  assert(!running.includes('unquoted-secret'))
  assert(!running.includes('split-secret'))
  assert(service.list()[0].recentStdout.every((line) => Buffer.byteLength(line) <= 64))
  assert(!JSON.stringify(events).includes('unclosed-secret'))
  assert(!JSON.stringify(events).includes('unquoted-secret'))
  assert(!JSON.stringify(events).includes('split-secret'))

  child.stdout.emit('data', `credential="oversized-secret-prefix-${'x'.repeat(1024 * 1024)}`)
  child.emit('exit', 1, null)
  assert(!JSON.stringify(events).includes('oversized-secret-prefix'))
  await service.stopAll()
}

{
  const spawnCalls = []
  const child = fakeChild(101)
  const service = createTaskService({
    spawnProcess: (...args) => { spawnCalls.push(args); return child },
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: () => {},
    stopTimeoutMs: 10
  })

  await assert.rejects(
    service.start({ workerId: 'auto', options: { command: '/bin/sh', args: ['-c', 'id'] } }),
    /Unsupported task start option/
  )

  const [first, second] = await Promise.all([
    service.start({ workerId: 'auto' }),
    service.start({ workerId: 'auto' })
  ])
  assert.equal(first.pid, second.pid)
  assert.equal(spawnCalls.length, 1)
  assert.deepEqual(spawnCalls[0].slice(0, 2), [process.execPath, ['/tmp/auto.mjs']])

  await assert.rejects(
    service.start({ workerId: 'unknown', command: '/bin/sh', args: ['-c', 'id'], cwd: '/tmp', env: {} }),
    /Unsupported worker id/
  )
  assert.equal(spawnCalls.length, 1)

  await service.stop({ workerId: 'auto' })
  assert.deepEqual(child.killSignals, ['SIGTERM'])
}

{
  const child = fakeChild(102, { exitOnSignal: false })
  const service = createTaskService({
    spawnProcess: () => child,
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: () => {},
    stopTimeoutMs: 5
  })
  await service.start({ workerId: 'auto' })
  const stopping = service.stop({ workerId: 'auto' })
  assert.equal(service.list()[0].status, 'stopping')
  await stopping
  assert.deepEqual(child.killSignals, ['SIGTERM', 'SIGKILL'])
}

{
  const events = []
  const child = fakeChild(150, { exitOnSignal: false })
  const service = createTaskService({
    spawnProcess: () => child,
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: (event, data) => events.push({ event, data }),
    stopTimeoutMs: 5,
    diagnosticLineBytes: 32,
    diagnosticStreamBytes: 64
  })
  await service.start({ workerId: 'auto' })
  child.stdout.emit('data', `${'a'.repeat(20)}token=boundary-secret-that-must-not-leak`)
  child.stdout.emit('data', 'x'.repeat(1024 * 1024))
  child.stdout.emit('data', '\n')
  for (let index = 0; index < 10; index++) child.stdout.emit('data', `${String(index).repeat(30)}\n`)

  const [running] = service.list()
  assert(running.recentStdout.every((line) => Buffer.byteLength(line) <= 32))
  assert(running.recentStdout.reduce((bytes, line) => bytes + Buffer.byteLength(line), 0) <= 64)
  assert(events.filter(({ event }) => event === 'task.progress').every(({ data }) => Buffer.byteLength(data.line) <= 32))
  assert(!JSON.stringify(events).includes('boundary-secret'))

  child.stderr.emit('data', `password=no-newline-secret${'z'.repeat(1024 * 1024)}`)
  child.emit('exit', 0, null)
  const stderrProgress = events.find(({ event, data }) => event === 'task.progress' && data.stream === 'stderr')
  assert(stderrProgress)
  assert(Buffer.byteLength(stderrProgress.data.line) <= 32)
  assert(!JSON.stringify(events).includes('no-newline-secret'))
}

{
  const children = []
  const events = []
  const service = createTaskService({
    spawnProcess: () => {
      const child = fakeChild(200 + children.length)
      children.push(child)
      return child
    },
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: (event, data) => events.push({ event, data }),
    stopTimeoutMs: 5
  })

  await service.start({ workerId: 'auto' })
  const child = children[0]
  const longOutput = Array.from({ length: 90 }, (_, index) => `line-${index}`).join('\n')
  child.stdout.emit('data', `${longOutput}\ntoken=super-secret\n`)
  child.stdout.emit('data', 'token=chunk-')
  child.stdout.emit('data', 'secret\n')
  child.stdout.emit('data', '{"token":"json-secret","safe":"ok"}\n')
  child.stderr.emit('data', 'password: hidden-value\n')

  const [running] = service.list()
  assert.equal(running.recentStdout.length, 80)
  assert.equal(running.recentStdout.at(-2), 'token=[redacted]')
  assert.equal(running.recentStdout.at(-1), '{"token":"[redacted]","safe":"ok"}')
  assert.equal(running.recentStderr.at(-1), 'password: [redacted]')
  assert(!JSON.stringify(events).includes('super-secret'))
  assert(!JSON.stringify(events).includes('hidden-value'))
  assert(!JSON.stringify(events).includes('chunk-secret'))
  assert(!JSON.stringify(events).includes('json-secret'))

  const stopping = service.stop({ workerId: 'auto' })
  await stopping
  child.emit('close', null, 'SIGTERM')
  child.emit('error', new Error('late error'))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(children.length, 1)
  const exits = events.filter(({ event }) => event === 'task.exited')
  assert.equal(exits.length, 1)
  assert.equal(exits[0].data.restarting, false)
  assert.equal(service.list().length, 0)
  assert(events.some(({ event, data }) => event === 'task.progress' && data.stream === 'stdout'))
}

{
  const children = []
  const service = createTaskService({
    spawnProcess: () => {
      const child = fakeChild(300 + children.length)
      children.push(child)
      return child
    },
    workerEntries: { auto: '/tmp/auto.mjs' },
    emit: () => {},
    stopTimeoutMs: 5
  })
  await service.start({ workerId: 'auto' })
  children[0].emit('exit', 1, null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(children.length, 2)
  assert.equal(service.list()[0].restartCount, 1)
  await service.stopAll()
  assert.equal(children.length, 2)
}

{
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-approvals-'))
  const queueFilePath = path.join(tempDir, 'private', 'queue.json')
  const events = []
  const service = createApprovalService({
    queueFilePath,
    emit: (event, data) => events.push({ event, data })
  })
  try {
    await fs.mkdir(path.dirname(queueFilePath), { recursive: true })
    await fs.writeFile(queueFilePath, JSON.stringify([
      { id: 'one', status: 'pending', latestHrMessage: 'hello' },
      { id: 'two', status: 'pending', latestHrMessage: 'world' }
    ]))

    assert.deepEqual((await service.list()).map(({ id }) => id), ['one', 'two'])
    assert.equal((await fs.stat(queueFilePath)).mode & 0o777, 0o600)
    const [approved, human] = await Promise.all([
      service.approve({ id: 'one' }),
      service.requireHuman({ id: 'two', reason: 'ambiguous' })
    ])
    assert.equal(approved.status, 'approved_auto_reply')
    assert.equal(human.status, 'human_required')
    assert.equal(human.reviewReason, 'ambiguous')
    assert.deepEqual(await service.list(), [])
    assert.equal((await fs.stat(queueFilePath)).mode & 0o777, 0o600)
    assert.equal((await fs.stat(path.dirname(queueFilePath))).mode & 0o777, 0o700)
    assert.deepEqual(events, [{ event: 'approval.required', data: human }])
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

console.log('ggr backend task service check passed')
