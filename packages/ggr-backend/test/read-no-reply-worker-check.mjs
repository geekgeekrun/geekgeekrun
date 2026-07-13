import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  runReadNoReply,
  runReadNoReplyEntry,
  workerExitCode
} from '../lib/workers/read-no-reply.mjs'
import {
  consumeApprovedAutoReply,
  handleLatestHrMessage
} from '../lib/workers/read-no-reply/flow.mjs'
import { createReadNoReplyRuntime, readAuthoritativeSession } from '../lib/workers/read-no-reply/runtime.mjs'
import { defaultPromptMap, requestNewMessageContent } from '../lib/workers/read-no-reply/llm.mjs'
import {
  canSendSelfReminder,
  cookieListIsValid,
  handleSelfReminder,
  nextTraversalAction,
  resolveBlockedCompanyPattern,
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

{
  let generation = 0
  const storage = {
    async readSession() {
      const current = generation++
      return {
        cookies: [{ name: 'wt2', value: `cookie-${current}`, domain: '.zhipin.com', path: '/', secure: true, session: true, httpOnly: true }],
        localStorage: { generation: current }
      }
    },
    async readCookies() { throw new Error('worker must not read legacy cookie mirrors') },
    async readLocalStorage() { throw new Error('worker must not read legacy local-storage mirrors') }
  }
  const session = await readAuthoritativeSession(storage)
  assert.deepEqual(session, {
    cookies: [{ name: 'wt2', value: 'cookie-0', domain: '.zhipin.com', path: '/', secure: true, session: true, httpOnly: true }],
    localStorage: { generation: 0 }
  }, 'a concurrent generation cannot mix cookies from one snapshot with local storage from another')
  assert.equal(generation, 1, 'the worker must read exactly one authoritative paired session')
}
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=22&encryptJobId=job-1' }) }, { friendId: 22, encryptJobId: 'job-1' }), true)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg?securityId=sec-1', request: () => ({ postData: () => JSON.stringify({ friendId: 22, encryptJobId: 'job-1' }) }) }, { friendId: 22, securityId: 'sec-1', encryptJobId: 'job-1' }), true)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=99' }) }, { friendId: 22, encryptJobId: 'job-1' }), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg?friendId=122', request: () => ({ postData: () => '' }) }, { friendId: 22 }), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'encryptJobId=70' }) }, { encryptJobId: 7 }), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=22&encryptJobId=70' }) }, { friendId: 22, encryptJobId: 7 }), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => '{malformed' }) }, { friendId: 22 }), false)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg?friendId=22&encryptJobId=7', request: () => ({ postData: () => '' }) }, { friendId: 22, encryptJobId: 7 }), true)
assert.equal(responseMatchesChat({ url: () => 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg', request: () => ({ postData: () => 'friendId=22&encryptJobId=7' }) }, { friendId: 22, encryptJobId: 7 }), true)
assert.equal(selectedChatMatches({ friendId: 22, encryptJobId: 'job-1' }, { friendId: 22, encryptJobId: 'job-1' }, { encryptJobId: 'job-1' }), true)
assert.equal(selectedChatMatches({ friendId: 99, encryptJobId: 'old' }, { friendId: 22, encryptJobId: 'job-1' }, { encryptJobId: 'old' }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: true }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: true }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: true, isExpectedJob: true }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: false }), false)
assert.equal(canSendSelfReminder({ conversation: { bothTalked: false }, history: [{ isSelf: true }], isJobClosed: false, isExpectedJob: true }), true)
assert.deepEqual(nextTraversalAction(false, 25), { cursor: 24, toTop: false, delayMs: 3000 })
assert.deepEqual(nextTraversalAction(true, 25), { cursor: 0, toTop: true, delayMs: 10000 })
assert.equal(resolveBlockedCompanyPattern({ blockCompanyNameRegExpStr: 'boss-root', fieldsForUseCommonConfig: {} }, { blockCompanyNameRegExpStr: 'common' }), 'boss-root')
assert.equal(resolveBlockedCompanyPattern({ blockCompanyNameRegExpStr: 'boss-root', fieldsForUseCommonConfig: { blockCompanyNameRegExpStr: true } }, { blockCompanyNameRegExpStr: 'common' }), 'common')
assert.match(defaultPromptMap.rechat.content, /简历分析层/)
assert.match(defaultPromptMap.rechat.content, /质量控制层/)

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
  let capturedMessages
  const result = await requestNewMessageContent([], {
    runtimePaths, settings: { llm: [{ id: 'one', providerCompleteApiUrl: 'https://invalid.test', providerApiSecret: 'secret', model: 'test' }] },
    complete: async (_config, messages) => { capturedMessages = messages; return { choices: [{ message: { content: '{"response":"model reply"}' } }], usage: { completion_tokens: 2, prompt_tokens: 3, total_tokens: 5 } } },
    recordUsage: async (record) => usage.push(record)
  })
  assert.equal(result.responseText, 'model reply'); assert.equal(usage[0].totalTokens, 5)
  assert.match(capturedMessages[0].content, /硬技能/)
  const diagnostics = []
  const originalConsoleError = console.error
  console.error = (...args) => diagnostics.push(args.join(' '))
  let historyResult
  try {
    historyResult = await requestNewMessageContent([{ text: 'prior reply' }], {
      runtimePaths, settings: { llm: [{ id: 'one', providerCompleteApiUrl: 'https://invalid.test', providerApiSecret: 'secret', model: 'test' }] },
      complete: async (_config, messages) => { assert.match(messages[2].content, /```json/); assert.match(messages[3].content, /不能与之前/); return { choices: [{ message: { content: '{"response":"valid despite log failure"}' } }], usage: {} } },
      recordUsage: async () => { throw new Error('database unavailable') }
    })
  } finally { console.error = originalConsoleError }
  assert.equal(historyResult.responseText, 'valid despite log failure')
  assert.deepEqual(diagnostics, ['CANNOT_SAVE_LLM_COMPLETION_LOG'])
  await fs.rm(root, { recursive: true, force: true })
}

{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-entry-'))
  const successRuntime = path.join(root, 'success.mjs')
  const failureRuntime = path.join(root, 'failure.mjs')
  await fs.writeFile(successRuntime, `export async function createReadNoReplyRuntime(){let n=0;return{runOnce:async()=>n++,shouldStop:async()=>n===1,close:async()=>{}}}`)
  await fs.writeFile(failureRuntime, `export async function createReadNoReplyRuntime(){throw Object.assign(new Error('missing executable'),{code:'PUPPETEER_IS_NOT_EXECUTABLE'})}`)
  const entry = fileURLToPath(new URL('../lib/workers/read-no-reply.mjs', import.meta.url))
  const baseEnv = { ...process.env, NODE_ENV: 'test' }
  const child = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { ...baseEnv, GGR_TEST_READ_NO_REPLY_RUNTIME_MODULE: pathToFileURL(successRuntime).href } })
  assert.equal(child.status, 0); assert.match(child.stdout, /"state":"starting"/); assert.match(child.stdout, /"state":"completed"/)
  const failedChild = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: { ...baseEnv, GGR_TEST_READ_NO_REPLY_RUNTIME_MODULE: pathToFileURL(failureRuntime).href } })
  assert.equal(failedChild.status, 85); assert.match(failedChild.stdout, /PUPPETEER_IS_NOT_EXECUTABLE/)
  await fs.rm(root, { recursive: true, force: true })
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
