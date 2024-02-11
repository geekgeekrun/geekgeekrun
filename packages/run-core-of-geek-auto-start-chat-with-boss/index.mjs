import DingtalkPlugin from '@bossgeekgo/dingtalk-plugin/index.mjs'
import { mainLoop } from '@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import fs from 'node:fs'
import path from 'node:path'
import { get__dirname } from '@bossgeekgo/utils/legacy-path.mjs';

const { groupRobotAccessToken: dingTalkAccessToken } = JSON.parse(
  fs.readFileSync(
    path.join(
      get__dirname(),
      '../../config/dingtalk.json'
    )
  )
)

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

;(async () => {
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
      void err
    }
  }
})()