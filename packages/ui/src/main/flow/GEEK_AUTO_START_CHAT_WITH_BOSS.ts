import DingtalkPlugin from '@bossgeekgo/dingtalk-plugin/index.mjs'
import { app } from 'electron'
import { SyncHook, AsyncSeriesHook } from 'tapable'
import { readConfigFile } from '@bossgeekgo/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import * as net from 'net'
import {
  checkPuppeteerExecutable,
  getExpectPuppeteerExecutablePath
} from './CHECK_AND_DOWNLOAD_DEPENDENCIES/check-and-download-puppeteer'
import * as childProcess from 'node:child_process'
import * as JSONStream from 'JSONStream'

const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}

export const runAutoChat = async () => {
  let pipe: null | net.Socket = null
  try {
    pipe = new net.Socket({ fd: 3 })
  } catch {
    console.warn('pipe is not available')
  }
  pipe?.write(
    JSON.stringify({
      type: 'INITIALIZE_PUPPETEER'
    }) + '\r\n'
  )
  try {
    await (await import('@bossgeekgo/geek-auto-start-chat-with-boss/index.mjs')).initPuppeteer()
    pipe?.write(
      JSON.stringify({
        type: 'PUPPETEER_INITIALIZE_SUCCESSFULLY'
      }) + '\r\n'
    )
  } catch {
    console.error(new Error('PUPPETEER_MAY_NOT_INSTALLED'))
    pipe?.write(
      JSON.stringify({
        type: 'PUPPETEER_MAY_NOT_INSTALLED'
      }) + '\r\n'
    )
    app.exit(1)
    return
  }

  const isPuppeteerExecutable = await checkPuppeteerExecutable()
  if (!isPuppeteerExecutable) {
    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'checkAndDownloadDependenciesForInit',
      PUPPETEER_EXECUTABLE_PATH: await getExpectPuppeteerExecutablePath()
    }
    const subProcessOfCheckAndDownloadDependencies = childProcess.spawn(
      process.argv[0],
      process.argv.slice(1),
      {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe']
      }
    )

    await new Promise((resolve) => {
      subProcessOfCheckAndDownloadDependencies!.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        (raw) => {
          const data = raw
          switch (data.type) {
            case 'NEED_RESETUP_DEPENDENCIES': {
              pipe?.write(JSON.stringify(data) + '\r\n')
              break
            }
            case 'PUPPETEER_DOWNLOAD_PROGRESS': {
              pipe?.write(JSON.stringify(data) + '\r\n')
              break
            }
            case 'PUPPETEER_MAY_NOT_INSTALLED': {
              resolve(data)
              break
            }
            default: {
              return
            }
          }
        }
      )
    })
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
  pipe?.write(
    JSON.stringify({
      type: 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED' //geek-auto-start-chat-with-boss-started
    }) + '\r\n'
  )
  while (true) {
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
}
