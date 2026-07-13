import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

import { createRuntimePaths } from '../../runtime-paths.mjs'
import { createApprovalService } from '../../services/approval-service.mjs'
import { processConversations } from './traversal.mjs'
import { getGptContent } from './llm.mjs'
import { createBrowserHistory } from '../../services/browser/dependencies/browser-history.mjs'
import { createBrowserStorage } from '../../services/browser/storage.mjs'
import { cookieListIsValid } from './traversal.mjs'

const FATAL_CODES = ['COOKIE_INVALID', 'LOGIN_STATUS_INVALID', 'ERR_INTERNET_DISCONNECTED', 'ACCESS_IS_DENIED', 'PUPPETEER_IS_NOT_EXECUTABLE', 'LLM_UNAVAILABLE']
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) { if (error?.code === 'ENOENT') return fallback; throw error }
}

async function loadSettings(paths) {
  const [boss, common, llm] = await Promise.all([
    readJson(path.join(paths.configDir, 'boss.json'), {}),
    readJson(path.join(paths.configDir, 'common-job-condition-config.json'), {}),
    readJson(path.join(paths.configDir, 'llm.json'), [])
  ])
  return { ...boss, commonJobCondition: common, llm }
}

async function openDatabase(paths) {
  const { initDb } = await import('@geekgeekrun/sqlite-plugin')
  return initDb(paths.databaseFile)
}

export async function readAuthoritativeSession(storage) {
  const session = await storage.readSession()
  const cookies = session?.cookies
  if (!cookieListIsValid(cookies)) throw Object.assign(new Error('Boss cookies are invalid'), { code: 'COOKIE_INVALID' })
  return { cookies, localStorage: session.localStorage }
}

async function openSession(paths) {
  const { cookies, localStorage } = await readAuthoritativeSession(createBrowserStorage({ storageDir: paths.storageDir }))
  const browserInfo = await createBrowserHistory({ storageDir: paths.storageDir }).read()
  if (!browserInfo?.executablePath) throw Object.assign(new Error('PUPPETEER_IS_NOT_EXECUTABLE'), { code: 'PUPPETEER_IS_NOT_EXECUTABLE' })
  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
  const { setDomainLocalStorage } = await import('@geekgeekrun/utils/puppeteer/local-storage.mjs')
  const { puppeteer } = await initPuppeteer()
  let browser
  try { browser = await puppeteer.launch({ executablePath: browserInfo.executablePath, headless: false, ignoreHTTPSErrors: true, defaultViewport: { width: 1440, height: 800 } }) }
  catch (error) {
    if (/Could not find Chrome|no executable was found|executable/i.test(error?.message ?? '')) error.code = 'PUPPETEER_IS_NOT_EXECUTABLE'
    throw error
  }
  try {
    const [page] = await browser.pages()
    for (const cookie of cookies) await page.setCookie({ ...cookie, ...(Object.hasOwn(cookie, 'sameSite') ? { sameSite: 'unspecified' } : {}) })
    await setDomainLocalStorage(browser, 'https://www.zhipin.com/desktop/', localStorage)
    try { await page.goto('https://www.zhipin.com/web/geek/chat', { timeout: 0 }) }
    catch (error) { if (error?.message?.includes('ERR_INTERNET_DISCONNECTED')) error.code = 'ERR_INTERNET_DISCONNECTED'; throw error }
    const url = page.url()
    if (url.includes('/web/user/')) throw Object.assign(new Error('LOGIN_STATUS_INVALID'), { code: 'LOGIN_STATUS_INVALID' })
    if (url.includes('/web/common/403') || url.includes('/web/common/error')) throw Object.assign(new Error('ACCESS_IS_DENIED'), { code: 'ACCESS_IS_DENIED' })
    return { browser, page }
  } catch (error) {
    await browser.close().catch(() => {})
    throw error
  }
}

function appendApproval(approval, clock = () => new Date()) {
  return async (request) => approval.update((queue) => {
    const dedupeKey = createHash('sha256').update([request.hrName, request.company, request.jobTitle, request.latestHrMessage].join('\n')).digest('hex')
    const existing = queue.find((item) => item.dedupeKey === dedupeKey && item.status === 'pending')
    if (existing) return existing
    const item = { id: randomUUID(), dedupeKey, createdAt: clock().toISOString(), status: 'pending', ...request }
    queue.push(item)
    return item
  })
}

function defaultDependencies(paths) {
  const approval = createApprovalService({ queueFilePath: path.join(paths.storageDir, 'hr-reply-approval-queue.json') })
  return {
    loadSettings: () => loadSettings(paths), openDatabase: () => openDatabase(paths), openSession: () => openSession(paths),
    processConversations,
    approval: {
      listApprovals: (options) => approval.list(options),
      appendApprovalRequest: appendApproval(approval),
      markApproval: (id, status, reason = '') => approval.setStatus({ id, status, reason, extra: status === 'auto_reply_sent' ? { sentAt: new Date().toISOString() } : {} })
    }
  }
}

async function saveCurrentChatRecords(page, database) {
  const [{ saveChatMessageRecord }, { ChatMessageRecord }] = await Promise.all([
    import('../../../../sqlite-plugin/dist/handlers.js'),
    import('../../../../sqlite-plugin/dist/entity/ChatMessageRecord.js')
  ])
  const [user, boss, records] = await Promise.all([
    page.evaluate(`document.querySelector('.main-wrap')?.__vue__?.$store?.state?.userInfo`),
    page.evaluate(`document.querySelector('.chat-conversation .chat-record')?.__vue__?.boss`),
    page.evaluate(`document.querySelector('.message-content .chat-record')?.__vue__?.records$ ?? []`)
  ])
  const mapped = records.filter((item) => ['received', 'sent'].includes(item.style)).map((item) => Object.assign(new ChatMessageRecord(), {
    mid: item.mid, style: item.style, type: item.type, text: item.text, time: item.time ? new Date(item.time) : null,
    encryptFromUserId: item.style === 'sent' ? user?.encryptUserId : boss?.encryptBossId,
    encryptToUserId: item.style === 'sent' ? boss?.encryptBossId : user?.encryptUserId,
    imageUrl: item.image?.originImage?.url
  }))
  await saveChatMessageRecord(database, mapped)
}

async function recordLlmUsage(database, payload) {
  const { saveGptCompletionRequestRecord } = await import('../../../../sqlite-plugin/dist/handlers.js')
  await saveGptCompletionRequestRecord(database, [{ ...payload, requestScene: 2 }])
}

async function checkJobIsClosed({ page, database, conversation }) {
  if (!conversation?.encryptJobId) return false
  const { getJobHireStatusRecord, saveJobHireStatusRecord } = await import('../../../../sqlite-plugin/dist/handlers.js')
  let record = await getJobHireStatusRecord(database, conversation.encryptJobId)
  if (!record || (record.hireStatus === 1 && Date.now() - Number(new Date(record.lastSeenDate)) > 6 * 60 * 60 * 1000)) {
    const detail = await page.$('#main .chat-conversation [ka="geek_chat_job_detail"] .right-content')
    if (detail) {
      let detailPage
      try {
        const targetPromise = page.browser().waitForTarget((target) => target.url().startsWith(`https://www.zhipin.com/job_detail/${conversation.encryptJobId}`), { timeout: 15000 })
        await detail.click()
        detailPage = await (await targetPromise).page()
        await detailPage.waitForFunction(() => Boolean(document.querySelector('#main .job-banner')) || document.documentElement.innerText?.includes('您访问的页面不存在'), { timeout: 15000 })
        const status = await detailPage.evaluate(() => {
          if (document.documentElement.innerText?.includes('您访问的页面不存在')) return 3
          return document.querySelector('#main .job-banner .job-status')?.textContent?.trim() === '职位已关闭' ? 2 : 1
        })
        await saveJobHireStatusRecord(database, { encryptJobId: conversation.encryptJobId, hireStatus: status, lastSeenDate: new Date() })
      } catch {} finally { await detailPage?.close().catch(() => {}) }
      record = await getJobHireStatusRecord(database, conversation.encryptJobId)
    }
  }
  return Boolean(record && record.hireStatus !== 1)
}

export async function createReadNoReplyRuntime({ runtimePaths = createRuntimePaths(os.homedir()), dependencies = {}, rerunInterval = Number.isFinite(Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)) ? Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL) : 5000 } = {}) {
  const deps = { ...defaultDependencies(runtimePaths), ...dependencies }
  const settings = await deps.loadSettings(runtimePaths)
  const database = await deps.openDatabase(runtimePaths)
  let session
  let closed = false
  async function closeSession() {
    const current = session
    session = undefined
    await current?.browser?.close?.().catch(() => {})
  }
  return {
    async runOnce({ taskReporter, shouldStop }) {
      try {
        session = await deps.openSession(runtimePaths)
        taskReporter.emit('task.progress', { workerId: 'readNoReplyAutoReminderMain', state: 'running' })
        await deps.processConversations({
          ...session, database, settings, taskReporter, shouldStop, approval: deps.approval,
          operations: {
            requestReviewDraft: (messages) => getGptContent(messages, { runtimePaths, settings, recordUsage: (record) => recordLlmUsage(database, record) }),
            saveCurrentChatRecords: (page) => saveCurrentChatRecords(page, database),
            checkJobIsClosed
          }
        })
      } catch (error) {
        const code = error?.code ?? FATAL_CODES.find((item) => error instanceof Error && error.message.includes(item))
        if (code) {
          const stable = error instanceof Error ? error : new Error(String(error))
          stable.code = code
          throw stable
        }
        taskReporter.emit('task.progress', { workerId: 'readNoReplyAutoReminderMain', state: 'restarting', delayMs: rerunInterval })
        await sleep(rerunInterval)
      } finally { await closeSession() }
    },
    async close() {
      if (closed) return
      closed = true
      await closeSession()
      if (typeof database?.destroy === 'function') await database.destroy()
      else await database?.close?.()
    }
  }
}
