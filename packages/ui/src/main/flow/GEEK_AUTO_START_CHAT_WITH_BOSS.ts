import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { app } from 'electron'
import { SyncHook, AsyncSeriesHook } from 'tapable'
import { readConfigFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import * as fs from 'fs'
import {
  checkPuppeteerExecutable,
} from './CHECK_AND_DOWNLOAD_DEPENDENCIES/check-and-download-puppeteer-executable'
import { pipeWriteRegardlessError } from './utils/pipe'

const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

let isParentProcessDisconnect = false

export const runAutoChat = async () => {
  const { initPuppeteer, mainLoop, closeBrowserWindow } = await import(
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
  } catch {
    app.exit(1)
    return
  }

  const isPuppeteerExecutable = await checkPuppeteerExecutable()
  if (!isPuppeteerExecutable) {
    app.exit(1)
    return
  }

  const hooks = {
    puppeteerLaunched: new SyncHook(),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new SyncHook(['positionInfoDetail']),
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
  while (!([isParentProcessDisconnect].includes(true))) {
    try {
      await mainLoop(hooks)
    } catch (err) {
      console.log(err)
      // if(err instanceof Error && err.message.includes('ERR_MODULE_NOT_FOUND')) {
      //   throw err
      // } else {
      void err
      // }
    }
  }
  closeBrowserWindow()
}
