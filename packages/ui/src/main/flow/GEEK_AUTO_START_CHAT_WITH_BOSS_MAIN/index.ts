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

import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
import gtag from '../../utils/gtag'
import GtagPlugin from '../../utils/gtag/GtagPlugin'
import { connectToDaemon, sendToDaemon } from '../OPEN_SETTING_WINDOW/connect-to-daemon'
import { PeriodPushCurrentPageScreenshotPlugin } from '../../utils/screenshot'
import { checkShouldExit } from '../../utils/worker'
const { default: SqlitePlugin } = SqlitePluginModule

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
  new PeriodPushCurrentPageScreenshotPlugin().apply(hooks)
}

const runAutoChat = async () => {
  const { initPuppeteer, mainLoop, closeBrowserWindow, autoStartChatEventBus } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
  )
  process.on('disconnect', () => {
    closeBrowserWindow()
    app.exit()
  })
  app.dock?.hide()
  try {
    await initPuppeteer()
  } catch (err) {
    console.error(err)
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
    return
  }

  const isPuppeteerExecutable = !!(await getAnyAvailablePuppeteerExecutable())
  if (!isPuppeteerExecutable) {
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
    return
  }

  const hooks = {
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
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
  await connectToDaemon()
  await sendToDaemon(
    {
      type: 'ping'
    },
    {
      needCallback: true
    }
  )
  runAutoChat()
}

attachListenerForKillSelfOnParentExited()
