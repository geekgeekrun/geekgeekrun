/**
 * 招聘端调试工具 worker：启动浏览器到沟通页，然后等待主进程通过 stdio fd3 发来的调试命令。
 * 主进程 spawn 时 stdio 为 [inherit, inherit, inherit, 'pipe', 'pipe']，故 fd3=父写→子读，fd4=子写→父读。
 * Node 的 process.stdio 只有 [0,1,2]，子进程需用 fs 从 fd3/fd4 建流。
 * 每条命令为 JSON 对象，字段：{ type: string, id: string, ...params }
 * 每条响应为 JSON 对象，字段：{ id: string, ok: boolean, result?: any, error?: string }
 *
 * 支持的命令类型：
 *   - ping：探活，返回 { ok: true }
 *   - dismiss-intent-dialog：关闭「意向沟通」弹窗
 *   - close-online-resume：关闭在线简历弹窗
 *   - open-online-resume：打开当前会话的在线简历
 *   - check-attach-resume：检查当前会话是否有附件简历消息
 *   - request-attach-resume：请求附件简历（点击按钮+确认弹窗）
 *   - download-attach-resume：预览并下载当前会话已有的附件简历
 *   - accept-incoming-attach-resume：同意对方发来的附件简历请求
 *   - get-panel-name：获取右侧面板当前候选人姓名
 *   - extract-resume-text：打开当前会话的在线简历，用 Canvas hook 提取纯文本，完成后关闭弹窗
 */

import * as fs from 'node:fs'
import { app } from 'electron'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import { getLastUsedAndAvailableBrowser } from '../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import * as JSONStream from 'JSONStream'
import { pipeWriteRegardlessError } from '../utils/pipe'

const log = (msg: string) => console.log(`[boss-chat-debug-worker] ${msg}`)

// 子进程侧：fd3=读（主进程发来的命令），fd4=写（回 READY/命令结果）
const cmdReadStream = fs.createReadStream(null, { fd: 3 })
const replyWriteStream = fs.createWriteStream(null, { fd: 4 })

const send = (obj: object) => {
  pipeWriteRegardlessError(replyWriteStream, JSON.stringify(obj) + '\n')
}

const runDebug = async () => {
  app.dock?.hide()
  log('启动调试工具...')

  const puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  if (!puppeteerExecutable) {
    log('未找到可用浏览器，退出')
    send({ type: 'READY', ok: false, error: 'NO_BROWSER' })
    app.exit(1)
    return
  }
  log(`找到浏览器: ${puppeteerExecutable.executablePath}`)
  process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutable.executablePath

  log('动态 import boss package...')
  const { initPuppeteer } = (await import('@geekgeekrun/boss-auto-browse-and-chat/index.mjs')) as any
  const {
    requestAttachmentResume,
    openOnlineResume,
    hasIncomingAttachResumeRequest,
    acceptIncomingAttachResume,
    openPreviewAndDownloadPdf,
  } = (await import('@geekgeekrun/boss-auto-browse-and-chat/chat-page-resume.mjs')) as any
  const { setupCanvasTextHook, extractResumeText } = (await import('@geekgeekrun/boss-auto-browse-and-chat/resume-extractor.mjs')) as any
  const {
    BOSS_CHAT_PAGE_URL,
    CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR,
    CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR,
    CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR,
    CHAT_PAGE_ACTIVE_NAME_SELECTOR,
    CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR
  } = (await import('@geekgeekrun/boss-auto-browse-and-chat/constant.mjs')) as any
  const { createHumanCursor } = (await import('@geekgeekrun/boss-auto-browse-and-chat/humanMouse.mjs')) as any
  const { readStorageFile, ensureStorageFileExist } = (await import('@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs')) as any
  const { setDomainLocalStorage } = (await import('@geekgeekrun/utils/puppeteer/local-storage.mjs')) as any

  const { puppeteer } = await initPuppeteer()
  ensureStorageFileExist()

  log('启动浏览器...')
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    protocolTimeout: 120000,
    defaultViewport: { width: 1440, height: 900 - 140 }
  })

  const page = (await browser.pages())[0]
  const { getCapturedText, clearCapturedText } = await setupCanvasTextHook(page)

  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')
  if (Array.isArray(bossCookies) && bossCookies.length > 0) {
    await page.setCookie(...bossCookies)
  }
  await setDomainLocalStorage(browser, 'https://www.zhipin.com/desktop/', bossLocalStorage || {})
  await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60000 })
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 120000 })

  log('浏览器已就绪，发送 READY')
  send({ type: 'READY', ok: true })

  browser.once('disconnected', () => {
    log('浏览器已关闭，退出')
    app.exit(0)
  })

  // 监听主进程发来的调试命令（从 fd3 读）
  cmdReadStream.pipe(JSONStream.parse()).on('data', async (cmd: any) => {
    const { id, type } = cmd ?? {}
    if (!id || !type) return

    log(`收到命令: ${type} (id=${id})`)

    const reply = (ok: boolean, result?: any, error?: string) => {
      send({ id, ok, result, error })
    }

    try {
      const cursor = await createHumanCursor(page)

      switch (type) {
        case 'ping':
          reply(true, 'pong')
          break

        case 'get-panel-name': {
          const name = await page.$eval(CHAT_PAGE_ACTIVE_NAME_SELECTOR, (el: any) => el.textContent?.trim() ?? '').catch(() => '')
          reply(true, { name })
          break
        }

        case 'dismiss-intent-dialog': {
          const btn = await page.$(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR).catch(() => null)
          if (!btn) { reply(true, { found: false }); break }
          await page.click(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR).catch(() => {
            page.click(CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR).catch(() => {})
          })
          await page.waitForSelector(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR, { hidden: true, timeout: 3000 }).catch(() => {})
          reply(true, { found: true })
          break
        }

        case 'close-online-resume': {
          const btn = await page.$(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => null)
          if (!btn) { reply(true, { found: false }); break }
          await page.click(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => {})
          await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR, { hidden: true, timeout: 4000 }).catch(() => {})
          reply(true, { found: true })
          break
        }

        case 'open-online-resume': {
          const ok = await openOnlineResume(page, { cursor, clearCapturedText })
          reply(ok, { opened: ok })
          break
        }

        case 'check-attach-resume': {
          const btn = await page.$(CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR).catch(() => null)
          reply(true, { hasAttachment: !!btn })
          break
        }

        case 'request-attach-resume': {
          const result = await requestAttachmentResume(page, { cursor })
          reply(result.requested, result)
          break
        }

        case 'download-attach-resume': {
          const result = await openPreviewAndDownloadPdf(page, null, { cursor })
          reply(result.clickedDownload, result)
          break
        }

        case 'accept-incoming-attach-resume': {
          const hasIncoming = await hasIncomingAttachResumeRequest(page)
          if (!hasIncoming) { reply(true, { found: false }); break }
          const accepted = await acceptIncomingAttachResume(page, { cursor })
          reply(accepted, { found: true, accepted })
          break
        }

        case 'extract-resume-text': {
          // 1. 清空上次 Canvas 捕获数据
          await clearCapturedText(page)
          // 2. 打开在线简历（openOnlineResume 内部等待 iframe 出现）
          const opened = await openOnlineResume(page, { cursor, clearCapturedText })
          if (!opened) {
            reply(false, null, '未找到「查看在线简历」按钮或 iframe 未出现')
            break
          }
          // 3. 稳定轮询 Canvas 渲染（与 chat-page-processor 逻辑一致）
          const POLL_INTERVAL_MS = 400
          const STABLE_POLLS_NEEDED = 2
          const CANVAS_POLL_TIMEOUT = 8000
          const canvasDeadline = Date.now() + CANVAS_POLL_TIMEOUT
          let lastCount = -1
          let stableCount = 0
          while (Date.now() < canvasDeadline) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
            const currentCount = await page.evaluate(() => (window as any).__canvasCapturedText?.length ?? 0)
            if (currentCount > 0 && currentCount === lastCount) {
              stableCount++
              if (stableCount >= STABLE_POLLS_NEEDED) break
            } else {
              stableCount = currentCount > 0 ? 1 : 0
            }
            lastCount = currentCount
          }
          // 4. 读取并清空捕获数据
          const captured = await getCapturedText(page)
          const rawLines: string[] = extractResumeText(captured)
          // 5. 过滤字体预热行（含「活跃」的行之前丢弃）
          const filteredLines = (() => {
            const idx = rawLines.findIndex((l: string) => l.includes('活跃'))
            if (idx > 0) return rawLines.slice(idx)
            return rawLines.filter((l: string) => /[\u4e00-\u9fff]/.test(l))
          })()
          const resumeText = filteredLines.join('\n')
          // 6. 关闭简历弹窗
          await page.click(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => {})
          await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR, { hidden: true, timeout: 3000 }).catch(() => {})
          reply(true, { resumeText, charCount: resumeText.length })
          break
        }

        default:
          reply(false, null, `未知命令: ${type}`)
      }
    } catch (err: any) {
      log(`命令 ${type} 执行出错: ${err?.message}`)
      reply(false, null, err?.message ?? String(err))
    }
  })
}

export const waitForProcessHandShakeAndRunDebug = async () => {
  await app.whenReady()
  app.on('window-all-closed', () => {
    // keep alive
  })
  runDebug()
}

attachListenerForKillSelfOnParentExited()
