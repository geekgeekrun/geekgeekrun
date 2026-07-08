import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createLocalProcessController,
  createDaemonController,
  approveReply,
  readApprovalQueue,
  rejectReply,
  updateRuntimeConfig,
  TASKS
} from '../index.mjs'

assert.equal(TASKS.AUTO_CHAT.workerId, 'geekAutoStartWithBossMain')
assert.equal(TASKS.READ_NO_REPLY.workerId, 'readNoReplyAutoReminderMain')

const local = createLocalProcessController({
  spawnProcess: () => {
    const listeners = new Map()
    function addListener(event, handler) {
      const handlers = listeners.get(event) ?? []
      handlers.push(handler)
      listeners.set(event, handlers)
    }
    function emit(event, ...args) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args)
      }
    }
    return {
      pid: 12345,
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      once: addListener,
      kill: () => emit('exit', 0, null)
    }
  }
})

assert.equal(local.getStatus().running, false)
const started = await local.start({ headless: true, mode: 'semi_auto' })
assert.equal(started.running, true)
assert.equal(started.pid, 12345)
assert.equal(started.headless, true)
assert.equal(started.mode, 'semi_auto')
const stopped = await local.stop()
assert.equal(stopped.running, false)

let emitBrokenChild
const brokenLocal = createLocalProcessController({
  spawnProcess: () => {
    const listeners = new Map()
    emitBrokenChild = (event, ...args) => {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args)
      }
    }
    return {
      pid: 23456,
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      once: (event, handler) => listeners.set(event, [...(listeners.get(event) ?? []), handler]),
      kill: () => {}
    }
  }
})
await brokenLocal.start()
emitBrokenChild('error', new Error('spawn failed'))
assert.equal(brokenLocal.getStatus().running, false)
assert.equal(brokenLocal.getStatus().lastError, 'spawn failed')

const calls = []
const daemon = createDaemonController({
  runTask: async ({ mode }) => {
    calls.push(['runTask', mode])
    return { isAlreadyRunning: false, runRecordId: 7 }
  },
  sendToDaemon: async (message) => {
    calls.push(['sendToDaemon', message])
    if (message.type === 'get-status') {
      return { workers: [{ workerId: TASKS.AUTO_CHAT.workerId, pid: 42 }] }
    }
    return { success: true }
  }
})

assert.equal((await daemon.getTaskStatus(TASKS.AUTO_CHAT.workerId)).running, true)
assert.deepEqual(await daemon.startTask(TASKS.AUTO_CHAT.workerId), { isAlreadyRunning: false, runRecordId: 7 })
await daemon.stopTask(TASKS.AUTO_CHAT.workerId)
assert.equal(calls.some((call) => call[0] === 'sendToDaemon' && call[1].type === 'stop-worker'), true)
await assert.rejects(() => daemon.startTask('unknownTask'), /Unsupported task id/)

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-controller-'))
const queueFilePath = path.join(tmpDir, 'queue.json')
await fs.writeFile(queueFilePath, JSON.stringify([
  { id: '1', status: 'pending', latestHrMessage: '薪资多少？' },
  { id: '2', status: 'approved', latestHrMessage: 'ok' }
]))
const pending = await readApprovalQueue({ queueFilePath })
assert.equal(pending.length, 1)
assert.equal(pending[0].id, '1')
const approved = await approveReply({ id: '1', queueFilePath })
assert.equal(approved.status, 'approved')
assert.equal((await readApprovalQueue({ queueFilePath })).length, 0)
const rejected = await rejectReply({ id: '2', queueFilePath, reason: 'not safe' })
assert.equal(rejected.status, 'rejected')
assert.equal(rejected.reviewReason, 'not safe')
await fs.writeFile(queueFilePath, '{bad json')
assert.deepEqual(await readApprovalQueue({ queueFilePath }), [])

const oldHome = process.env.HOME
const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-controller-home-'))
process.env.HOME = tempHome
try {
  const configDir = path.join(tempHome, '.geekgeekrun/config')
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(path.join(configDir, 'boss.json'), '{bad json')
  await updateRuntimeConfig({ fileName: 'boss.json', patch: { headlessTerminalLoggerForTest: true } })
  const bossConfig = JSON.parse(await fs.readFile(path.join(tempHome, '.geekgeekrun/config/boss.json'), 'utf8'))
  assert.equal(bossConfig.headlessTerminalLoggerForTest, true)
  const files = await fs.readdir(configDir)
  assert.ok(files.some((fileName) => fileName.startsWith('boss.json.corrupt-') && fileName.endsWith('.bak')))
  await assert.rejects(
    () => updateRuntimeConfig({ fileName: 'llm.json', patch: { model: 'x' } }),
    /llm\.json must be replaced with an array/
  )
} finally {
  process.env.HOME = oldHome
  await fs.rm(tempHome, { recursive: true, force: true })
}

console.log('ggr-controller check passed')
