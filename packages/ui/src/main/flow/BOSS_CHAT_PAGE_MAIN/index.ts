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
    startBossChatPageProcess: (hooks: any, options?: { browser?: any; page?: any; getCapturedText?: any; clearCapturedText?: any }) => Promise<void>
    initPuppeteer: () => Promise<{ puppeteer: any }>
  }
  const {
    startBossChatPageProcess,
    initPuppeteer
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

  while (true) {
    let browser: any = null
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

      const page = (await browser.pages())[0]
      // 注入 Canvas fillText hook，必须在页面导航前注入（evaluateOnNewDocument）
      const { getCapturedText, clearCapturedText } = await setupCanvasTextHook(page)
      if (Array.isArray(bossCookies) && bossCookies.length > 0) {
        await page.setCookie(...bossCookies)
      }
      await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage || {})
      await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60 * 1000 })
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 120 * 1000 })

      sendToDaemon({
        type: 'worker-to-gui-message',
        data: {
          type: 'prerequisite-step-by-step-checkstep-by-step-check',
          step: { id: 'login-status-check', status: 'fulfilled' },
          runRecordId
        }
      })

      log('开始执行 startBossChatPageProcess（沟通页）...')
      await startBossChatPageProcess(hooks, { browser, page, getCapturedText, clearCapturedText })
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
      const rerunMs = cfg?.chatPage?.rerunIntervalMs ?? rerunInterval
      log(`下次运行将在 ${rerunMs}ms 后开始`)
      await sleep(rerunMs)
    } catch (err) {
      if (browser) {
        try { await browser.close() } catch (e) { void e }
        browser = null
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
