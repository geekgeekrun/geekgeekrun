import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { mainLoop } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import fs from 'node:fs'
import path from 'node:path'
import { get__dirname } from '@geekgeekrun/utils/legacy-path.mjs';
import JSON5 from 'json5'
import { readConfigFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
const { cookies: bossCookies } = readConfigFile('boss.json')
const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

;(async () => {
  if (!bossCookies?.length) {
    console.error('There is no cookies. You can save a copy with EditThisCookie extension.')
    process.exit(1)
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
      console.error(err)
    }
  }
})()