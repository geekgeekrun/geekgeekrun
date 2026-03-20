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
  console.log(`[boss-worker] ${msg}`)
}

const checkForBossVerification = async (page: any): Promise<boolean> => {
  try {
    const url: string = page.url()
    if (/verify|captcha|security.?check|safe\b|\/safe\/|安全验证/.test(url)) return true
    return await page.evaluate(() => {
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

const waitForBossVerificationCompletion = async (page: any, expectedUrlPrefix: string): Promise<boolean> => {
  log('⚠️  检测到 BOSS 安全验证，请在浏览器窗口中手动完成验证，完成后将自动继续...')
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
        log('✅ 安全验证已完成，继续处理...')
        return true
      }
    } catch { /* 页面可能正在跳转，继续等待 */ }
  }
  log('验证等待超时（5 分钟），将重启浏览器重试')
  return false
}

const runAutoBrowseAndChat = async () => {
  app.dock?.hide()
  log('runAutoBrowseAndChat 开始')
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
    default: (hooks: any, opts?: { returnBrowser?: boolean; jobId?: string; browser?: any; page?: any }) => Promise<void | { browser: any; page: any }>
    startBossChatPageProcess: (hooks: any, options?: { browser?: any; page?: any; jobId?: string }) => Promise<void>
    initPuppeteer: () => Promise<any>
    launchBrowserAndNavigateToChat?: () => Promise<{ browser: any; page: any }>
    bossAutoBrowseEventBus: InstanceType<typeof import('node:events').EventEmitter>
  }
  const {
    default: startBossAutoBrowse,
    startBossChatPageProcess,
    initPuppeteer,
    launchBrowserAndNavigateToChat,
    bossAutoBrowseEventBus
  } = (await import('@geekgeekrun/boss-auto-browse-and-chat/index.mjs')) as unknown as BossAutoBrowseModule
  log('boss package import 完成，初始化 puppeteer...')

  process.on('disconnect', () => {
    app.exit()
  })

  await initPuppeteer()
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
  log('插件初始化完成，即将启动浏览器...')

  hooks.beforeBrowserLaunch.tapPromise('log', async () => { log('beforeBrowserLaunch') })
  hooks.afterBrowserLaunch.tapPromise('log', async () => { log('afterBrowserLaunch - 浏览器已启动') })
  hooks.beforeNavigateToRecommend.tapPromise('log', async () => { log('beforeNavigateToRecommend - 正在导航到推荐页') })

  bossAutoBrowseEventBus.once('LOGIN_STATUS_INVALID', () => {})

  hooks.onCandidateListLoaded.tap('sendLoginStatusCheck', () => {
    log('onCandidateListLoaded - 登录成功，候选人列表已加载')
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'prerequisite-step-by-step-checkstep-by-step-check',
        step: {
          id: 'login-status-check',
          status: 'fulfilled'
        },
        runRecordId
      }
    })
  })

  // Accumulate candidate results for webhook reporting
  const sessionCandidates: Array<{
    basicInfo?: Record<string, unknown>
    filterReport?: Record<string, unknown>
    llmConclusion?: string
    resumeFile?: { path?: string; filename?: string }
  }> = []

  hooks.afterChatStarted.tapPromise('collectCandidateForWebhook', async (candidate: unknown) => {
    const c = candidate as Record<string, unknown>
    const entry = {
      basicInfo: c?.info as Record<string, unknown> | undefined,
      filterReport: {
        matched: true,
        matchedRules: (c?.matchedRules as string[] | undefined) ?? [],
        score: c?.score as number | undefined
      },
      llmConclusion: c?.llmConclusion as string | undefined,
      resumeFile: c?.resumeFilePath
        ? { path: c.resumeFilePath as string, filename: c?.resumeFileName as string | undefined }
        : undefined
    }
    sessionCandidates.push(entry)

    // 逐条实时触发：每打招呼后立即发送一条 webhook
    try {
      const { readConfigFile: readBossConfigFile, storageFilePath } = await import(
        '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
      )
      const webhookConfig = readBossConfigFile('webhook.json')
      if (webhookConfig?.enabled && webhookConfig?.url && webhookConfig?.sendMode === 'realtime') {
        const { sendWebhook, normalizeWebhookConfig } = await import('../../features/webhook/index')
        const normalized = normalizeWebhookConfig(webhookConfig)
        if (normalized?.sendMode === 'realtime') {
          const runId = `run-${runRecordId ?? Date.now()}`
          const timestamp = new Date().toISOString()
          const webhookPayload = {
            runId,
            timestamp,
            summary: { total: 1, matched: 1, skipped: 0 },
            candidates: [entry]
          }
          log(`webhook 实时发送 1 条候选人...`)
          await sendWebhook(normalized, webhookPayload, { storageDir: storageFilePath })
          log(`webhook 实时发送完成`)
        }
      }
    } catch (realtimeErr) {
      log(
        `webhook 实时发送失败（不影响主流程）：${realtimeErr instanceof Error ? realtimeErr.message : String(realtimeErr)}`
      )
    }
  })

  hooks.onProgress.tap('sendProgressToGui', (payload: unknown) => {
    const p = payload as { phase?: string; current?: number; max?: number }
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'boss-auto-browse-progress',
        workerId: 'bossAutoBrowseAndChatMain',
        runRecordId,
        phase: p?.phase,
        current: p?.current ?? 0,
        max: p?.max ?? 0
      }
    })
  })

  while (true) {
    try {
      const { readBossJobsConfig, getMergedJobConfig } = await import(
        '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
      )
      const jobsConfig = readBossJobsConfig()
      const sequenceJobs = (jobsConfig.jobs || []).filter(
        (j: any) => j.sequence?.enabled === true
      )

      if (sequenceJobs.length > 0) {
        log(`检测到多职位队列，共 ${sequenceJobs.length} 个职位，依次执行...`)
        let sharedBrowser: any = null
        let sharedPage: any = null

        try {
          for (const job of sequenceJobs) {
            const jid = job.jobId ?? job.id
            const jname = job.jobName ?? job.name
            log(`开始执行职位 ${jid}（${jname}）...`)
            void getMergedJobConfig(jid)

            const runRecommend = job.sequence?.runRecommend !== false
            const runChat = job.sequence?.runChat !== false

            if (runChat && !sharedPage) {
              log(`[${jid}] 仅沟通页，先启动浏览器...`)
              const boot = await launchBrowserAndNavigateToChat()
              sharedBrowser = boot.browser
              sharedPage = boot.page
            }

            if (runRecommend) {
              log(`[${jid}] 执行推荐页...`)
              const result = await startBossAutoBrowse(hooks, {
                returnBrowser: true,
                jobId: jid,
                browser: sharedBrowser ?? undefined,
                page: sharedPage ?? undefined
              } as any)
              if (result?.browser) {
                sharedBrowser = result.browser
                sharedPage = result.page
              }
            }

            if (runChat && sharedBrowser && sharedPage) {
              log(`[${jid}] 执行沟通页...`)
              await startBossChatPageProcess(hooks, {
                browser: sharedBrowser,
                page: sharedPage,
                jobId: jid
              })
            }
          }
        } finally {
          if (sharedBrowser) {
            try {
              await sharedBrowser.close()
            } catch (e) {
              void e
            }
            sharedBrowser = null
            sharedPage = null
          }
        }
      } else {
        log('开始执行 startBossAutoBrowse（推荐页）...')
        const result = await startBossAutoBrowse(hooks, { returnBrowser: true })
        if (result?.browser && result?.page) {
          try {
            log('推荐页完成，开始处理沟通页未读...')
            await startBossChatPageProcess(hooks, { browser: result.browser, page: result.page })
          } finally {
            try {
              await result.browser.close()
            } catch (e) {
              void e
            }
          }
        }
      }
      log('startBossAutoBrowse + 沟通页 完成，检查 webhook 配置...')
      try {
        const { readConfigFile: readBossConfigFile, storageFilePath } = await import(
          '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
        )
        const webhookConfig = readBossConfigFile('webhook.json')
        if (!webhookConfig?.enabled || !webhookConfig?.url) {
          log('webhook 未启用或未配置 URL，跳过发送')
        } else if (webhookConfig.sendMode === 'realtime') {
          log('webhook 为实时模式，已在每条打招呼后发送，跳过汇总发送')
        } else if (sessionCandidates.length === 0) {
          log('本轮无候选人数据，跳过 webhook')
        } else {
          const { sendWebhook } = await import('../../features/webhook/index')
          const matched = sessionCandidates.filter((c) => c.filterReport?.matched !== false).length
          const skipped = sessionCandidates.length - matched
          const webhookPayload = {
            runId: `run-${runRecordId ?? Date.now()}`,
            timestamp: new Date().toISOString(),
            summary: { total: sessionCandidates.length, matched, skipped },
            candidates: sessionCandidates as Parameters<typeof sendWebhook>[1]['candidates']
          }
          log(`正在发送 webhook，共 ${sessionCandidates.length} 条候选人数据...`)
          const webhookResult = await sendWebhook(webhookConfig, webhookPayload, {
            storageDir: storageFilePath
          })
          log(`webhook 发送完成，HTTP ${webhookResult.status}，body 长度 ${webhookResult.body.length}`)
        }
      } catch (webhookErr) {
        log(`webhook 发送失败（不影响主流程）：${webhookErr instanceof Error ? webhookErr.message : String(webhookErr)}`)
      }
      sessionCandidates.length = 0
      log('等待下次运行...')
    } catch (err) {
      // ── 检测是否为安全验证触发的超时，若是则发送 OS 通知提醒用户 ──
      // （推荐页流程浏览器由内部管理，验证后浏览器会重启；此处仅通知用户需要手动完成验证）
      try {
        const errMsg = err instanceof Error ? err.message : String(err)
        if (/TimeoutError|timeout|waitForSelector|waitForFunction/i.test(errMsg)) {
          log('检测到超时类错误，可能是 BOSS 安全验证导致。若浏览器窗口有验证提示，请手动完成，程序将在下一轮自动重启。')
          try {
            const { Notification } = await import('electron')
            new Notification({
              title: 'GeekGeekRun - 可能需要人工验证',
              body: 'BOSS 直聘可能弹出了安全验证。请检查浏览器窗口，完成验证后程序将在下一轮自动重启继续。'
            }).show()
          } catch { /* Notification 不可用时静默忽略 */ }
        }
      } catch { /* 不影响主流程 */ }

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
      console.error(err)
      const shouldExit = await checkShouldExit()
      if (shouldExit) {
        app.exit()
        return
      }
      console.log(
        `[Boss Auto Browse Main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`
      )
      await sleep(rerunInterval)
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
  forwardConsoleLogToDaemon('bossAutoBrowseAndChatMain', runRecordId)
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
  runAutoBrowseAndChat()
}

attachListenerForKillSelfOnParentExited()
