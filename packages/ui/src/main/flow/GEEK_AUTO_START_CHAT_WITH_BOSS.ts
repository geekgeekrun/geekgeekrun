import DingtalkPlugin from '@bossgeekgo/dingtalk-plugin/index.mjs'
import { app } from 'electron'
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
  try {
    await (await import('@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs')).initPuppeteer()
  } catch {
    console.error(new Error('PUPPETEER_MAY_NOT_INSTALLED'))
    app.exit(1)
    return
  }

  const mainLoop = (await import('@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs')).mainLoop
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
      console.log(err)
      if(err instanceof Error && err.message.includes('ERR_MODULE_NOT_FOUND')) {
        throw err
      }
    }
  }
}
