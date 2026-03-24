import { DingtalkPlugin } from '@geekgeekrun/dingtalk-plugin'
import { mainLoop, closeBrowserWindow } from '@geekgeekrun/geek-auto-start-chat-with-boss'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import { readConfigFile, readStorageFile, getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils'
import { sleep } from '@geekgeekrun/utils'
import {
  AUTO_CHAT_ERROR_EXIT_CODE
} from './enums'

import SqlitePlugin from '@geekgeekrun/sqlite-plugin'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()

process.on('disconnect', () => {
  process.exit()
})

const bossCookies = readStorageFile('boss-cookies.json')
const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks: any): void => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
}

const main = async (): Promise<void> => {
  if (!bossCookies?.length) {
    console.error('There is no cookies. You can save a copy with EditThisCookie extension.')
    process.exit(AUTO_CHAT_ERROR_EXIT_CODE.COOKIE_INVALID)
  }
  const hooks = {
    daemonInitialized: new AsyncSeriesHook<[]>() as any,
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook<string, string>() as any,
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']),
    encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']),
    sageTimeExit: new AsyncSeriesHook(['args'])
  }
  initPlugins(hooks)
  await hooks.daemonInitialized.callAsync(() => {})
  while (true) {
    try {
      await mainLoop(hooks)
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
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
      }
      closeBrowserWindow?.()
      console.error(err)
      console.log(`[Run core main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`)
      await sleep(rerunInterval)
    }
  }
}

(async () => {
  try {
    await main()
  } catch(err) {
    console.error(err)
  }
})()
