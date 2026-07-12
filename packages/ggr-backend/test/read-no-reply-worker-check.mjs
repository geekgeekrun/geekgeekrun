import assert from 'node:assert/strict'

import {
  runReadNoReply,
  runReadNoReplyEntry,
  workerExitCode
} from '../lib/workers/read-no-reply.mjs'
import {
  consumeApprovedAutoReply,
  handleLatestHrMessage
} from '../lib/workers/read-no-reply/flow.mjs'
import { createReadNoReplyRuntime } from '../lib/workers/read-no-reply/runtime.mjs'

function reporter() {
  const events = []
  return { events, emit: (event, data) => events.push({ event, data }) }
}

assert.equal(workerExitCode({ code: 'LOGIN_STATUS_INVALID' }), 82)
assert.equal(workerExitCode({ code: 'READ_NO_REPLY_FAILED' }), 1)

{
  const reports = reporter()
  let closeCount = 0
  let runs = 0
  await runReadNoReply({
    runtime: {
      async runOnce() { runs++ },
      async close() { closeCount++ }
    },
    taskReporter: reports,
    shouldStop: async () => runs === 1
  })
  assert.equal(runs, 1)
  assert.equal(closeCount, 1)
  assert(reports.events.some(({ data }) => data.state === 'stopping'))
  assert(reports.events.some(({ data }) => data.state === 'completed'))
}

{
  const reports = reporter()
  let closeCount = 0
  await assert.rejects(runReadNoReply({
    runtime: {
      async runOnce() { throw new Error('LOGIN_STATUS_INVALID: expired') },
      async close() { closeCount++ }
    },
    taskReporter: reports,
    shouldStop: async () => false
  }), { code: 'LOGIN_STATUS_INVALID' })
  assert.equal(closeCount, 1)
  assert(reports.events.some(({ data }) => data.state === 'failed' && data.code === 'LOGIN_STATUS_INVALID'))
}

{
  const sent = []
  const result = await handleLatestHrMessage({
    latestMessage: { isSelf: false, text: '还在看机会吗？' },
    context: { userName: 'Toby' },
    operations: {
      sendMessage: async (text) => sent.push(text),
      requestReviewDraft: async () => { throw new Error('must not request model') },
      appendApprovalRequest: async () => { throw new Error('must not queue approval') }
    }
  })
  assert.equal(result.action, 'auto-replied')
  assert.equal(sent.length, 1)
}

{
  const approvals = []
  const result = await handleLatestHrMessage({
    latestMessage: { isSelf: false, text: '你的期望薪资是多少？' },
    context: { hrName: 'Alice', company: 'Example', jobTitle: 'Engineer' },
    historyMessages: [{ text: '历史消息' }],
    operations: {
      sendMessage: async () => { throw new Error('unsafe reply must not send') },
      requestReviewDraft: async () => '可以具体沟通',
      appendApprovalRequest: async (request) => approvals.push(request)
    }
  })
  assert.equal(result.action, 'approval-required')
  assert.equal(approvals[0].draftSafety, 'needs_human_review')
  assert.equal(approvals[0].draftSource, 'model_review_draft')
}

{
  const status = []
  const sent = []
  const handled = await consumeApprovedAutoReply({
    latestMessage: { isSelf: false, text: '方便聊聊吗' },
    context: { hrName: 'Alice', company: 'Example', jobTitle: 'Engineer' },
    operations: {
      listApprovals: async () => [{ id: 'a1', status: 'approved_auto_reply', hrName: 'Alice', company: 'Example', jobTitle: 'Engineer', latestHrMessage: '方便聊聊吗', draftReply: '您好，可以的' }],
      sendMessage: async (text) => sent.push(text),
      markApproval: async (id, nextStatus) => status.push([id, nextStatus])
    }
  })
  assert.equal(handled, true)
  assert.deepEqual(sent, ['您好，可以的'])
  assert.deepEqual(status, [['a1', 'auto_reply_sent']])
}

{
  const reports = reporter()
  let created = 0
  const result = await runReadNoReplyEntry({
    createRuntime: async () => {
      created++
      let runs = 0
      return {
        async runOnce() { runs++ },
        async shouldStop() { return runs === 1 },
        async close() {}
      }
    },
    taskReporter: reports
  })
  assert.equal(created, 1)
  assert.equal(result, 0)
  assert(reports.events.some(({ data }) => data.state === 'starting'))
}

{
  const calls = []
  const runtime = await createReadNoReplyRuntime({
    runtimePaths: { configDir: '/tmp/config', storageDir: '/tmp/storage', databaseFile: '/tmp/database' },
    dependencies: {
      loadSettings: async () => ({ autoReminder: {} }),
      openDatabase: async () => ({ close: async () => calls.push('database.close') }),
      openSession: async () => ({ page: {}, browser: { close: async () => calls.push('browser.close') } }),
      processConversations: async ({ shouldStop }) => { calls.push('process'); assert.equal(await shouldStop(), false) }
    }
  })
  await runtime.runOnce({ taskReporter: reporter(), shouldStop: async () => false })
  await runtime.close()
  assert.deepEqual(calls, ['process', 'browser.close', 'database.close'])
}

console.log('ggr backend read-no-reply worker check passed')
