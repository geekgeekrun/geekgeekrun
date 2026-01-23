import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { app, dialog } from 'electron'
import { SyncHook, AsyncSeriesHook } from 'tapable'
import {
  readConfigFile,
  getPublicDbFilePath
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
// import { pipeWriteRegardlessError } from '../utils/pipe'
import { getAnyAvailablePuppeteerExecutable } from '../CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import minimist from 'minimist'
import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
import gtag from '../../utils/gtag'
import GtagPlugin from '../../utils/gtag/GtagPlugin'
import { connectToDaemon, sendToDaemon } from '../OPEN_SETTING_WINDOW/connect-to-daemon'
// import { PeriodPushCurrentPageScreenshotPlugin } from '../../utils/screenshot'
import { checkShouldExit } from '../../utils/worker'
import { CookieInvalidHandlePlugin } from '../../features/cookie-invalid-handle-plugin'
import initPublicIpc from '../../utils/initPublicIpc'
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

const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
  new GtagPlugin().apply(hooks)
  // new PeriodPushCurrentPageScreenshotPlugin().apply(hooks)
  new CookieInvalidHandlePlugin().apply(hooks)
}

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
const runAutoChat = async () => {
  app.dock?.hide()
  const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
  if (!puppeteerExecutable) {
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
  const { initPuppeteer, mainLoop, closeBrowserWindow, autoStartChatEventBus } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
  )
  process.on('disconnect', () => {
    closeBrowserWindow()
    app.exit()
  })
  await initPuppeteer()

  const hooks = {
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new AsyncSeriesHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['userInfo']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['positionInfoDetail', 'markDetail']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']),
    encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']),
    sageTimeExit: new AsyncSeriesHook(['args'])
  }
  initPlugins(hooks)

  gtag('run_auto_chat_with_boss_main_ready')

  autoStartChatEventBus.once('LOGIN_STATUS_INVALID', () => {
  })

  while (true) {
    try {
      await mainLoop(hooks)
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          await dialog.showMessageBox({
            type: `error`,
            message: `登录状态无效`,
            detail: `请重新登录Boss直聘`
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
        if (err.message.includes(`Could not find Chrome`) || err.message.includes(`no executable was found`)) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
          break
        }
      }
      closeBrowserWindow?.()
      console.error(err)
      const shouldExit = await checkShouldExit()
      if (shouldExit) {
        app.exit()
        return
      }
      console.log(
        `[Run core main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`
      )
      await sleep(rerunInterval)
    }
  }
}

export const waitForProcessHandShakeAndRunAutoChat = async () => {
  await app.whenReady()
  app.on('window-all-closed', (e) => {
    e.preventDefault()
  })
  initPublicIpc()
  await connectToDaemon()
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
  runAutoChat()
}

attachListenerForKillSelfOnParentExited()
