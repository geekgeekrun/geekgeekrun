import { app, dialog } from 'electron'
import { AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import minimist from 'minimist'
import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
import { connectToDaemon, sendToDaemon } from '../OPEN_SETTING_WINDOW/connect-to-daemon'
import { checkShouldExit } from '../../utils/worker'
import initPublicIpc from '../../utils/initPublicIpc'
import { forwardConsoleLogToDaemon } from '../../utils/forwardConsoleLogToDaemon'
import { getLastUsedAndAvailableBrowser } from '../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import path from 'path'
const { default: SqlitePlugin } = SqlitePluginModule

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在退出')
  process.exit(0)
})

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }
  return v
})()

const initPlugins = async (hooks) => {
  const { storageFilePath } = await import(
    '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
  )
  new SqlitePlugin(path.join(storageFilePath, 'public.db')).apply(hooks)
}

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null

const log = (msg: string) => {
  console.log(`[boss-chat-page-worker] ${msg}`)
}

/**
 * 检测当前页面是否为 BOSS 安全验证页（URL 特征 + 页面文字 + 常见验证组件选择器）。
 * 没有具体截图样本，使用多重信号：命中任意一条即判定为验证页。
 */
const checkForBossVerification = async (page: any): Promise<boolean> => {
  try {
    const url: string = page.url()
    if (/verify|captcha|security.?check|safe\b|\/safe\/|安全验证/.test(url)) return true
    return await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase()
      const hasVerifyText = /请完成.{0,10}验证|安全验证|滑动.{0,6}滑块|人机验证|完成验证后继续|异常.{0,6}操作|验证码/.test(
        document.body?.innerText || ''
      )
      const hasVerifyEl = !!(
        document.querySelector('#nc_mask') ||
        document.querySelector('.verify-container') ||
        document.querySelector('.captcha-wrap') ||
        document.querySelector('.nc-container') ||
        document.querySelector('[class*="verify"][class*="wrap"]') ||
        document.querySelector('[class*="captcha"]')
      )
      return hasVerifyText || hasVerifyEl
    })
  } catch {
    return false
  }
}

/**
 * 等待用户完成验证（最长 5 分钟）。
 * 期间每 2s 轮询页面状态；完成后返回 true，超时返回 false。
 */
const waitForBossVerificationCompletion = async (page: any, expectedUrlPrefix: string, logFn: (msg: string) => void): Promise<boolean> => {
  logFn('⚠️  检测到 BOSS 安全验证，请在浏览器窗口中手动完成验证，完成后将自动继续...')
  try {
    const { Notification } = await import('electron')
    new Notification({
      title: 'GeekGeekRun - 需要人工验证',
      body: '检测到 BOSS 直聘安全验证，请在打开的浏览器窗口中完成验证，完成后程序将自动继续。'
    }).show()
  } catch { /* Notification 不可用时静默忽略 */ }

  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(2000)
    try {
      const url: string = page.url()
      const isStillVerify = await checkForBossVerification(page)
      if (url.startsWith(expectedUrlPrefix) && !isStillVerify) {
        logFn('✅ 安全验证已完成，继续处理...')
        return true
      }
    } catch { /* 页面可能正在跳转，继续等待 */ }
  }
  logFn('验证等待超时（5 分钟），将重启浏览器重试')
  return false
}

const runChatPage = async () => {
  app.dock?.hide()
  log('runChatPage 开始')
  log(`正在查找可用浏览器...`)
  let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  if (!puppeteerExecutable) {
    log('未找到可用浏览器，退出')
    await dialog.showMessageBox({
      type: `error`,
      message: `未找到可用的浏览器`,
      detail: `请重新运行本程序，按照提示安装、配置浏览器`
    })
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'prerequisite-step-by-step-checkstep-by-step-check',
        step: {
          id: 'puppeteer-executable-check',
          status: 'rejected'
        },
        runRecordId
      }
    })
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
    return
  }
  log(`找到浏览器: ${puppeteerExecutable.executablePath}`)
  sendToDaemon({
    type: 'worker-to-gui-message',
    data: {
      type: 'prerequisite-step-by-step-checkstep-by-step-check',
      step: {
        id: 'puppeteer-executable-check',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutable.executablePath

  log('正在动态 import boss package...')
  type BossAutoBrowseModule = {
    startBossChatPageProcess: (hooks: any, options?: {
      browser?: any; page?: any; getCapturedText?: any; clearCapturedText?: any;
      jobId?: string | null;
      retryCandidate?: { encryptGeekId: string; geekName: string; jobTitle: string } | null;
      processContext?: { currentCandidate: any } | null;
    }) => Promise<void>
    initPuppeteer: () => Promise<{ puppeteer: any }>
    dismissGovernanceNoticeDialog: (page: any) => Promise<void>
  }
  const {
    startBossChatPageProcess,
    initPuppeteer,
    dismissGovernanceNoticeDialog
  } = (await import('@geekgeekrun/boss-auto-browse-and-chat/index.mjs')) as unknown as BossAutoBrowseModule
  const { setupCanvasTextHook } = (await import('@geekgeekrun/boss-auto-browse-and-chat/resume-extractor.mjs')) as any
  log('boss package import 完成，初始化 puppeteer...')

  process.on('disconnect', () => {
    app.exit()
  })

  const { puppeteer } = await initPuppeteer()
  log('puppeteer 初始化完成，初始化 hooks 和插件...')

  const hooks = {
    beforeBrowserLaunch: new AsyncSeriesHook(['_']),
    afterBrowserLaunch: new AsyncSeriesHook(['_']),
    beforeNavigateToRecommend: new AsyncSeriesHook(['_']),
    onCandidateListLoaded: new AsyncSeriesHook(['_']),
    onCandidateFiltered: new AsyncSeriesWaterfallHook(['candidates', 'filterResult'] as any),
    beforeStartChat: new AsyncSeriesHook(['candidate']),
    afterChatStarted: new AsyncSeriesHook(['candidate', 'result'] as any),
    onError: new AsyncSeriesHook(['error']),
    onComplete: new AsyncSeriesHook(['_']),
    onProgress: new AsyncSeriesHook(['payload'] as any)
  }

  await initPlugins(hooks)
  log('插件初始化完成')

  hooks.afterBrowserLaunch.tapPromise('log', async () => { log('afterBrowserLaunch - 浏览器已启动') })
  hooks.onProgress.tap('sendProgressToGui', (payload: unknown) => {
    const p = payload as { phase?: string; current?: number; max?: number }
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'boss-auto-browse-progress',
        workerId: 'bossChatPageMain',
        runRecordId,
        phase: p?.phase,
        current: p?.current ?? 0,
        max: p?.max ?? 0
      }
    })
  })

  const { readStorageFile, ensureStorageFileExist } = await import('@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs') as any
  ensureStorageFileExist()

  const { BOSS_CHAT_PAGE_URL } = await import('@geekgeekrun/boss-auto-browse-and-chat/constant.mjs') as any
  const { setDomainLocalStorage } = await import('@geekgeekrun/utils/puppeteer/local-storage.mjs') as any
  const localStoragePageUrl = 'https://www.zhipin.com/desktop/'

  // browser/page/canvas hooks 提升到循环外，验证完成后可复用
  let browser: any = null
  let page: any = null
  let getCapturedText: any = null
  let clearCapturedText: any = null
  // processContext 提升到循环外，catch 块中可读取被中断的候选人
  const processContext: { currentCandidate: any } = { currentCandidate: null }

  while (true) {
    try {
      const { readConfigFile: readCfg } = await import(
        '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
      ) as any
      const cfg = readCfg('boss-recruiter.json') as {
        chatPage?: {
          runOnceAfterComplete?: boolean
          rerunIntervalMs?: number
          keepBrowserOpenAfterRun?: boolean
        }
      }
      const runOnceAfterComplete = cfg?.chatPage?.runOnceAfterComplete === true
      const keepBrowserOpenAfterRun = cfg?.chatPage?.keepBrowserOpenAfterRun === true

      // 仅在没有复用浏览器时才重新启动
      if (!browser) {
        log('启动浏览器...')
        await hooks.beforeBrowserLaunch?.promise?.()

        const headless = process.env.HEADLESS === '1'
        browser = await puppeteer.launch({
          headless,
          ignoreHTTPSErrors: true,
          protocolTimeout: 120000,
          defaultViewport: { width: 1440, height: 900 - 140 }
        })

        await hooks.afterBrowserLaunch?.promise?.()

        const bossCookies = readStorageFile('boss-cookies.json')
        const bossLocalStorage = readStorageFile('boss-local-storage.json')

        page = (await browser.pages())[0]
        // 注入 Canvas fillText hook，必须在页面导航前注入（evaluateOnNewDocument）
        const canvasHooks = await setupCanvasTextHook(page)
        getCapturedText = canvasHooks.getCapturedText
        clearCapturedText = canvasHooks.clearCapturedText
        if (Array.isArray(bossCookies) && bossCookies.length > 0) {
          await page.setCookie(...bossCookies)
        }
        await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage || {})
        await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60 * 1000 })
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 120 * 1000 })
        await new Promise(r => setTimeout(r, 1500))
        await dismissGovernanceNoticeDialog(page)

        sendToDaemon({
          type: 'worker-to-gui-message',
          data: {
            type: 'prerequisite-step-by-step-checkstep-by-step-check',
            step: { id: 'login-status-check', status: 'fulfilled' },
            runRecordId
          }
        })
      } else {
        log('复用已有浏览器实例，直接开始处理...')
      }

      log('读取职位队列配置...')
      const { readBossJobsConfig } = await import(
        '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
      ) as any
      const jobsConfig = readBossJobsConfig()
      const allJobs = jobsConfig?.jobs || []

      if (allJobs.length > 0) {
        const chatJobs = allJobs.filter(
          (j: any) => j.sequence?.enabled === true && j.sequence?.runChat !== false
        )
        if (chatJobs.length > 0) {
          log(`检测到 ${chatJobs.length} 个职位纳入沟通处理，依次执行...`)
          for (const job of chatJobs) {
            const jid = job.jobId ?? job.id
            const jname = job.jobName ?? job.name
            log(`开始处理职位 ${jid}（${jname}）的沟通页...`)
            processContext.currentCandidate = null
            await startBossChatPageProcess(hooks, { browser, page, getCapturedText, clearCapturedText, jobId: jid, processContext })
            log(`职位 ${jid} 沟通页处理完成`)
          }
        } else {
          log('当前没有勾选"纳入处理"的职位，跳过本轮沟通页扫描')
        }
      } else {
        log('未配置职位队列，开始执行 startBossChatPageProcess（处理所有未读）...')
        processContext.currentCandidate = null
        await startBossChatPageProcess(hooks, { browser, page, getCapturedText, clearCapturedText, processContext })
      }
      log('startBossChatPageProcess 完成')

      if (runOnceAfterComplete) {
        if (keepBrowserOpenAfterRun) {
          log('运行已结束，浏览器保持打开，请手动关闭浏览器窗口后将自动退出')
          await new Promise<void>((resolve) => {
            browser!.once('disconnected', () => resolve())
          })
        } else {
          try { await browser.close() } catch (e) { void e }
        }
        log('已配置 runOnceAfterComplete，本次运行后停止')
        process.exit(0)
      }

      try { await browser.close() } catch (e) { void e }
      browser = null
      page = null
      getCapturedText = null
      clearCapturedText = null
      const rerunMs = cfg?.chatPage?.rerunIntervalMs ?? rerunInterval
      log(`下次运行将在 ${rerunMs}ms 后开始`)
      await sleep(rerunMs)
    } catch (err) {
      // ── 优先检测安全验证，命中则等待完成后复用浏览器继续，而非重启 ──
      if (page) {
        try {
          const isVerify = await checkForBossVerification(page)
          if (isVerify) {
            // 保存被中断的候选人，验证完成后通过 retryCandidate 重试
            const interruptedCandidate = processContext.currentCandidate ?? null
            if (interruptedCandidate) {
              log(`⚠️  验证中断时正在处理候选人：${interruptedCandidate.geekName}（${interruptedCandidate.encryptGeekId}），验证后将优先重试`)
            }

            const completed = await waitForBossVerificationCompletion(page, BOSS_CHAT_PAGE_URL, log)
            if (completed) {
              // 验证完成：导航回沟通页
              try {
                await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60 * 1000 })
                await page.waitForFunction(() => document.readyState === 'complete', { timeout: 60 * 1000 })
              } catch { /* 导航失败则让下一轮处理 */ }

              // 若有被中断的候选人，立即单独重试（不依赖 jobId，在「全部」tab 中找回）
              if (interruptedCandidate) {
                log(`🔄 正在重试被验证中断的候选人：${interruptedCandidate.geekName}...`)
                try {
                  await startBossChatPageProcess(hooks, {
                    browser, page, getCapturedText, clearCapturedText,
                    retryCandidate: interruptedCandidate,
                    processContext: { currentCandidate: null }
                  })
                  log(`重试候选人 ${interruptedCandidate.geekName} 完成`)
                } catch (retryErr) {
                  log(`重试候选人时发生错误：${retryErr instanceof Error ? retryErr.message : String(retryErr)}`)
                }
              }

              continue // 重新进入循环，进行正常扫描
            }
          }
        } catch { /* 检测本身出错，走正常错误处理 */ }
      }

      // ── 正常错误处理：关闭浏览器、识别错误类型 ──
      if (browser) {
        try { await browser.close() } catch (e) { void e }
        browser = null
        page = null
        getCapturedText = null
        clearCapturedText = null
      }
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          await dialog.showMessageBox({
            type: `error`,
            message: `登录状态无效`,
            detail: `请重新登录BOSS直聘（招聘端）`
          })
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
          break
        }
        if (err.message.includes('ERR_INTERNET_DISCONNECTED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ERR_INTERNET_DISCONNECTED)
          break
        }
        if (err.message.includes('ACCESS_IS_DENIED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ACCESS_IS_DENIED)
          break
        }
        if (
          err.message.includes(`Could not find Chrome`) ||
          err.message.includes(`no executable was found`)
        ) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
          break
        }
      }
      console.error('[Boss Chat Page Main] error:', err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : JSON.stringify(err))
      const shouldExit = await checkShouldExit()
      if (shouldExit) {
        app.exit()
        return
      }
      const { readConfigFile: readErrCfg } = await import(
        '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
      ) as any
      const errCfg = readErrCfg('boss-recruiter.json') as { chatPage?: { rerunIntervalMs?: number } }
      const errRerunMs = errCfg?.chatPage?.rerunIntervalMs ?? rerunInterval
      log(`发生错误，浏览器将在 ${errRerunMs}ms 后重启`)
      await sleep(errRerunMs)
    }
  }
}

export const waitForProcessHandShakeAndRunAutoChat = async () => {
  await app.whenReady()
  app.on('window-all-closed', () => {
    // keep process alive while worker is running
  })
  initPublicIpc()
  await connectToDaemon()
  forwardConsoleLogToDaemon('bossChatPageMain', runRecordId)
  await sendToDaemon(
    {
      type: 'ping'
    },
    {
      needCallback: true
    }
  )
  sendToDaemon({
    type: 'worker-to-gui-message',
    data: {
      type: 'prerequisite-step-by-step-checkstep-by-step-check',
      step: {
        id: 'worker-launch',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  runChatPage()
}

attachListenerForKillSelfOnParentExited()
