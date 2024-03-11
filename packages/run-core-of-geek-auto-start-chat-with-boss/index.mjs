import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { mainLoop, closeBrowserWindow } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import fs from 'node:fs'
import path from 'node:path'
import { get__dirname } from '@geekgeekrun/utils/legacy-path.mjs';
import JSON5 from 'json5'
import { readConfigFile, readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
const bossCookies = readStorageFile('boss-cookies.json')
const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

const AUTO_CHAT_ERROR_EXIT_CODE = {
  COOKIE_INVALID: 81,
  LOGIN_STATUS_INVALID: 82
}

const main = async () => {
  if (!bossCookies?.length) {
    console.error('There is no cookies. You can save a copy with EditThisCookie extension.')
    process.exit(AUTO_CHAT_ERROR_EXIT_CODE.COOKIE_INVALID)
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
  while (true) {
    try {
      await mainLoop(hooks)
    } catch (err) {
      if (err instanceof Error && err.message.includes('LOGIN_STATUS_INVALID')) {
        process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
        break
      }
      await sleep(3000)
    }
  }
}
main()

process.on('error', async (error) => {
  closeBrowserWindow()
  console.error('error')
  console.error(error)
  await sleep(3000)

  main()
})

process.on('unhandledRejection', async (reason, promise) => {
  closeBrowserWindow()
  console.error('unhandledRejection')
  console.error(reason, promise)
  await sleep(3000)

  main()
});