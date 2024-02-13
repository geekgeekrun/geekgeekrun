import DingtalkPlugin from '@bossgeekgo/dingtalk-plugin/index.mjs'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import { readConfigFile } from '@bossgeekgo/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

export const runAutoChat = async () => {
  let mainLoop
  try {
    mainLoop = (await import('@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs')).mainLoop
  } catch {
    console.error(new Error('PUPPETEER_MAY_NOT_INSTALLED'))
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
      void err
    }
  }
}
