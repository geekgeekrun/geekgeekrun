import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { app } from 'electron'
import { SyncHook, AsyncSeriesHook } from 'tapable'
import {
  readConfigFile,
  getPublicDbFilePath
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

import * as fs from 'fs'
import { pipeWriteRegardlessError } from '../utils/pipe'
import { getAnyAvailablePuppeteerExecutable } from '../CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'

import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
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
}

let isParentProcessDisconnect = false

export const runAutoChat = async () => {
  const { initPuppeteer, mainLoop, closeBrowserWindow, autoStartChatEventBus } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
  )
  process.on('disconnect', () => {
    isParentProcessDisconnect = true
    closeBrowserWindow()
    app.exit()
  })
  app.dock?.hide()
  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.warn('pipe is not available')
  }
  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'INITIALIZE_PUPPETEER'
    }) + '\r\n'
  )
  try {
    await initPuppeteer()
    pipeWriteRegardlessError(
      pipe,
      JSON.stringify({
        type: 'PUPPETEER_INITIALIZE_SUCCESSFULLY'
      }) + '\r\n'
    )
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
    puppeteerLaunched: new SyncHook(),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo'])
  }
  initPlugins(hooks)
  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED' //geek-auto-start-chat-with-boss-started
    }) + '\r\n'
  )

  autoStartChatEventBus.once('LOGIN_STATUS_INVALID', () => {
    pipeWriteRegardlessError(
      pipe,
      JSON.stringify({
        type: 'LOGIN_STATUS_INVALID' //geek-auto-start-chat-with-boss-started
      }) + '\r\n'
    )
  })

  while (![isParentProcessDisconnect].includes(true)) {
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
      console.log(
        `[Run core main] An internal is caught, and browser will be restarted in ${rerunInterval}ms.`
      )
      await sleep(rerunInterval)
    }
  }
}
