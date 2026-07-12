import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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
import { requestNewMessageContent } from '../lib/workers/read-no-reply/llm.mjs'
import {
  canSendSelfReminder,
  cookieListIsValid,
  handleSelfReminder,
  nextTraversalAction,
  responseMatchesChat,
  selectedChatMatches,
  selectChatSafely
} from '../lib/workers/read-no-reply/traversal.mjs'

function reporter() {
  const events = []
  return { events, emit: (event, data) => events.push({ event, data }) }
}

assert.equal(workerExitCode({ code: 'LOGIN_STATUS_INVALID' }), 82)
assert.equal(workerExitCode({ code: 'READ_NO_REPLY_FAILED' }), 1)
assert.equal(cookieListIsValid([{ name: 'a', value: 'b', domain: '.zhipin.com', path: '/', secure: true, session: false, httpOnly: true }]), true)
assert.equal(cookieListIsValid([{ name: 'a' }]), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=22&encryptJobId=job-1' }) }, { friendId: 22, encryptJobId: 'job-1' }), true)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=99' }) }, { friendId: 22, encryptJobId: 'job-1' }), false)
assert.equal(selectedChatMatches({ friendId: 22, encryptJobId: 'job-1' }, { friendId: 22, encryptJobId: 'job-1' }, { encryptJobId: 'job-1' }), true)
assert.equal(selectedChatMatches({ friendId: 99, encryptJobId: 'old' }, { friendId: 22, encryptJobId: 'job-1' }, { encryptJobId: 'old' }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: true }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: true }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: true, isExpectedJob: true }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: false }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: true }), true)
assert.deepEqual(nextTraversalAction(false, 25), { cursor: 24, toTop: false, delayMs: 3000 })
assert.deepEqual(nextTraversalAction(true, 25), { cursor: 0, toTop: true, delayMs: 10000 })

{
  const stale = await selectChatSafely({
    target: { friendId: 22, encryptJobId: 'job-1' }, handle: { async click() {} }, timeout: 1, pause: async () => {},
    page: {
      waitForResponse: async () => ({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=22&encryptJobId=job-1' }) }),
      evaluate: async (expression) => expression.includes('selectedFriend') ? { friendId: 99, encryptJobId: 'old' } : { encryptJobId: 'old' }
    }
  })
  assert.equal(stale, null)
}

{
  const sent = []
  await handleSelfReminder({ reminder: { openContentSource: 1, constantOpenContent: 'configured constant' }, history: [], operations: { sendMessage: async (text) => sent.push(text) } })
  assert.deepEqual(sent, ['configured constant'])
  const llm = []
  await handleSelfReminder({ reminder: { openContentSource: 2 }, history: [], operations: { requestReviewDraft: async () => { llm.push('requested'); return 'model reply' }, sendMessage: async (text) => llm.push(text) } })
  assert.deepEqual(llm, ['requested', 'model reply'])
}

{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-rnrr-'))
  const runtimePaths = { configDir: path.join(root, 'config'), storageDir: path.join(root, 'storage') }
  await fs.mkdir(runtimePaths.configDir); await fs.mkdir(runtimePaths.storageDir)
  await fs.writeFile(path.join(runtimePaths.configDir, 'resumes.json'), JSON.stringify([{ content: { name: 'Test', geekWorkExpList: [], geekProjExpList: [] } }]))
  const usage = []
  const result = await requestNewMessageContent([], {
    runtimePaths, settings: { llm: [{ id: 'one', providerCompleteApiUrl: 'https://invalid.test', providerApiSecret: 'secret', model: 'test' }] },
    complete: async () => ({ choices: [{ message: { content: '{"response":"model reply"}' } }], usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 } }),
    recordUsage: async (record) => usage.push(record)
  })
  assert.equal(result.responseText, 'model reply'); assert.equal(usage[0].totalTokens, 5)
  await fs.rm(root, { recursive: true, force: true })
}

{
  const entry = new URL('../lib/workers/read-no-reply.mjs', import.meta.url).href
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `import {runReadNoReplyEntry} from ${JSON.stringify(entry)}; await runReadNoReplyEntry({createRuntime:async()=>{let n=0;return{runOnce:async()=>n++,shouldStop:async()=>n===1,close:async()=>{}}}}); console.log('safe-entry-ok')`], { encoding: 'utf8' })
  assert.equal(child.status, 0); assert.match(child.stdout, /safe-entry-ok/)
}

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
  await assert.rejects(runReadNoReplyEntry({ createRuntime: async () => { throw Object.assign(new Error('no browser'), { code: 'PUPPETEER_IS_NOT_EXECUTABLE' }) }, taskReporter: reports }), { code: 'PUPPETEER_IS_NOT_EXECUTABLE' })
  assert(reports.events.some(({ data }) => data.state === 'failed' && data.code === 'PUPPETEER_IS_NOT_EXECUTABLE'))
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
