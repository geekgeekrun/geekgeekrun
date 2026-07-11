import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  createLocalProcessController,
  createDaemonController,
  approveAutoReply,
  readApprovalQueue,
  requireHumanIntervention,
  markAutoReplySent,
  markAutoReplyFailed,
  markAutoReplyExpired,
  updateRuntimeConfig,
  readAppData,
  updateAppData,
  TASKS
} from '../index.mjs'

const execFile = promisify(execFileCallback)

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
await assert.rejects(
  () => local.start({ headless: true, mode: 'semi_auto' }),
  /Unsupported agent mode/
)
const started = await local.start({ headless: true, mode: 'auto' })
assert.equal(started.running, true)
assert.equal(started.pid, 12345)
assert.equal(started.headless, true)
assert.equal(started.mode, 'auto')
const stopped = await local.stop()
assert.equal(stopped.running, false)

let concurrentSpawnCount = 0
const concurrentLocal = createLocalProcessController({
  spawnProcess: () => ({
    pid: 30000 + ++concurrentSpawnCount,
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    once: () => {},
    kill: () => {}
  })
})
const concurrentStarts = await Promise.all([
  concurrentLocal.start({ mode: 'auto' }),
  concurrentLocal.start({ mode: 'auto' })
])
assert.equal(concurrentSpawnCount, 1)
assert.equal(concurrentStarts[0].pid, concurrentStarts[1].pid)

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
  { id: '2', status: 'approved_auto_reply', latestHrMessage: 'ok' }
]))
const pending = await readApprovalQueue({ queueFilePath })
assert.equal(pending.length, 1)
assert.equal(pending[0].id, '1')
const approved = await approveAutoReply({ id: '1', queueFilePath })
assert.equal(approved.status, 'approved_auto_reply')
assert.equal((await readApprovalQueue({ queueFilePath })).length, 0)
const humanRequired = await requireHumanIntervention({ id: '2', queueFilePath, reason: 'not safe' })
assert.equal(humanRequired.status, 'human_required')
assert.equal(humanRequired.reviewReason, 'not safe')
const sent = await markAutoReplySent({ id: '1', queueFilePath })
assert.equal(sent.status, 'auto_reply_sent')
assert.ok(sent.sentAt)
const failed = await markAutoReplyFailed({ id: '1', queueFilePath, reason: 'send failed' })
assert.equal(failed.status, 'auto_reply_failed')
assert.equal(failed.reviewReason, 'send failed')
const expired = await markAutoReplyExpired({ id: '1', queueFilePath, reason: 'context changed' })
assert.equal(expired.status, 'auto_reply_expired')
assert.equal(expired.reviewReason, 'context changed')

const concurrentQueueFilePath = path.join(tmpDir, 'concurrent-queue.json')
await fs.writeFile(
  concurrentQueueFilePath,
  JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ id: `concurrent-${index}`, status: 'pending' })))
)
await Promise.all(
  Array.from({ length: 12 }, (_, index) =>
    approveAutoReply({ id: `concurrent-${index}`, queueFilePath: concurrentQueueFilePath })
  )
)
const concurrentQueue = await readApprovalQueue({ includeAll: true, queueFilePath: concurrentQueueFilePath })
assert.ok(concurrentQueue.every((item) => item.status === 'approved_auto_reply'))

const multiProcessQueueFilePath = path.join(tmpDir, 'multi-process-queue.json')
await fs.writeFile(
  multiProcessQueueFilePath,
  JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ id: `process-${index}`, status: 'pending' })))
)
const controllerModuleUrl = new URL('../index.mjs', import.meta.url).href
const approveScript = `import { approveAutoReply } from ${JSON.stringify(controllerModuleUrl)}; await approveAutoReply({ id: process.argv[1], queueFilePath: process.argv[2] })`
await Promise.all(
  Array.from({ length: 8 }, (_, index) =>
    execFile(process.execPath, [
      '--input-type=module',
      '--eval',
      approveScript,
      `process-${index}`,
      multiProcessQueueFilePath
    ])
  )
)
const multiProcessQueue = await readApprovalQueue({ includeAll: true, queueFilePath: multiProcessQueueFilePath })
assert.ok(multiProcessQueue.every((item) => item.status === 'approved_auto_reply'))

await fs.writeFile(queueFilePath, '{bad json')
assert.deepEqual(await readApprovalQueue({ queueFilePath }), [])

const oldHome = process.env.HOME
const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-controller-home-'))
process.env.HOME = tempHome
try {
  const configDir = path.join(tempHome, '.geekgeekrun/config')
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(path.join(configDir, 'llm.json'), JSON.stringify([
    { providerApiSecret: 'sk-sensitive', apiKey: 'also-sensitive', model: 'test-model' }
  ]))
  const redactedLlmConfig = await readAppData({ resource: 'llm_config', configDir })
  assert.equal(redactedLlmConfig.data[0].providerApiSecret, '[redacted]')
  assert.equal(redactedLlmConfig.data[0].apiKey, '[redacted]')
  const updatedLlmConfig = await updateAppData({
    resource: 'llm_config',
    patch: [{ providerApiSecret: 'sk-updated', model: 'updated-model' }],
    configDir
  })
  assert.equal(updatedLlmConfig.data[0].providerApiSecret, '[redacted]')
  assert.equal(updatedLlmConfig.data[0].model, 'updated-model')
  const storedLlmConfig = JSON.parse(await fs.readFile(path.join(configDir, 'llm.json'), 'utf8'))
  assert.equal(Array.isArray(storedLlmConfig), true)
  assert.equal(storedLlmConfig[0].providerApiSecret, 'sk-updated')

  await fs.writeFile(path.join(configDir, 'boss.json'), '{bad json')
  await updateRuntimeConfig({ fileName: 'boss.json', patch: { headlessTerminalLoggerForTest: true } })
  const bossConfig = JSON.parse(await fs.readFile(path.join(tempHome, '.geekgeekrun/config/boss.json'), 'utf8'))
  assert.equal(bossConfig.headlessTerminalLoggerForTest, true)
  const files = await fs.readdir(configDir)
  assert.ok(files.some((fileName) => fileName.startsWith('boss.json.corrupt-') && fileName.endsWith('.bak')))
} finally {
  process.env.HOME = oldHome
  await fs.rm(tempHome, { recursive: true, force: true })
}

console.log('ggr-controller check passed')
