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
import * as JSONStream from 'JSONStream'

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
process.once('disconnect', () => {
  isParentProcessDisconnect = true
})

const runAutoChat = async () => {
  const { initPuppeteer, mainLoop, closeBrowserWindow, autoStartChatEventBus } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
  )
  process.on('disconnect', () => {
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
    daemonInitialized: new AsyncSeriesHook(),
    puppeteerLaunched: new SyncHook(),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['userInfo']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['positionInfoDetail', 'markDetail']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo'])
  }
  initPlugins(hooks)
  await hooks.daemonInitialized.promise()
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
        `[Run core main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`
      )
      await sleep(rerunInterval)
    }
  }
}
// suicide timer for parent and child process don't have any communication after child process spawned.
let suicideTimer: NodeJS.Timeout | null = null
const setSuicideTimer = () =>
  (suicideTimer = setTimeout(() => {
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.AUTO_START_CHAT_MAIN_PROCESS_SUICIDE)
  }, 10000))
const clearSuicideTimer = () => {
  if (suicideTimer) {
    clearTimeout(suicideTimer)
  }
  suicideTimer = null
}

export const waitForProcessHandShakeAndRunAutoChat = () => {
  setSuicideTimer()

  const pipeForRead: fs.ReadStream = fs.createReadStream(null, { fd: 3 })
  pipeForRead.on('error', () => {
    return
  })
  const pipeForReadWithJsonParser = pipeForRead.pipe(JSONStream.parse())
  pipeForReadWithJsonParser?.on('data', function waitForCanRun(data) {
    if (data.type === 'GEEK_AUTO_START_CHAT_CAN_BE_RUN') {
      pipeForReadWithJsonParser.off('data', waitForCanRun)
      clearSuicideTimer()
      runAutoChat()

      // if don't call close, when kill child process, child process will ANR.
      pipeForRead.close()
    }
  })

  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.error('pipe is not available')
    app.exit(1)
  }
  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'AUTO_START_CHAT_MAIN_PROCESS_STARTUP'
    })
  )
}
