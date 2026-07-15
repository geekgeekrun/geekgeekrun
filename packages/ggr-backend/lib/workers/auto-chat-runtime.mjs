import DingtalkPlugin from '@geekgeekrun/dingtalk-plugin/index.mjs'
import { mainLoop } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import { getPublicDbFilePath, readConfigFile, readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AsyncSeriesHook, SyncHook } from 'tapable'
import { resolveRerunInterval } from './restart-policy.mjs'

const { default: SqlitePlugin } = SqlitePluginModule
const KNOWN_FAILURES = ['LOGIN_STATUS_INVALID', 'ERR_INTERNET_DISCONNECTED', 'ACCESS_IS_DENIED']

function hooksForRuntime() {
  return {
    daemonInitialized: new AsyncSeriesHook(), puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']), pageLoaded: new SyncHook(), cookieWillSet: new AsyncSeriesHook(['args']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']), mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['positionInfoDetail']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['positionInfoDetail', 'markDetail']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']), newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    noPositionFoundForCurrentJob: new SyncHook(), noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']), encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']), sageTimeExit: new AsyncSeriesHook(['args'])
  }
}

export async function createAutoChatRuntime({ rerunInterval = resolveRerunInterval() } = {}) {
  if (!readStorageFile('boss-cookies.json')?.length) throw Object.assign(new Error('Boss cookies are required'), { code: 'COOKIE_INVALID' })
  const hooks = hooksForRuntime()
  const dingTalkToken = readConfigFile('dingtalk.json').groupRobotAccessToken
  new DingtalkPlugin(dingTalkToken).apply(hooks)
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
  await hooks.daemonInitialized.callAsync(() => {})
  return {
    async runOnce({ taskReporter }) {
      try {
        await mainLoop(hooks)
      } catch (error) {
        const knownCode = KNOWN_FAILURES.find((code) => error instanceof Error && error.message.includes(code))
        const closeError = error && typeof error === 'object' ? error.closeError : null
        taskReporter.emit('task.progress', {
          workerId: 'geekAutoStartWithBossMain',
          state: 'runtime-error',
          code: knownCode ?? error?.code ?? 'AUTO_CHAT_FAILED',
          message: error instanceof Error ? error.message : String(error),
          ...(closeError ? {
            closeError: {
              code: typeof closeError.code === 'string' ? closeError.code : 'BROWSER_CLOSE_FAILED',
              message: closeError instanceof Error ? closeError.message : String(closeError)
            }
          } : {})
        })
        if (knownCode) throw Object.assign(error, { code: knownCode })
        taskReporter.emit('task.progress', { workerId: 'geekAutoStartWithBossMain', state: 'restarting', delayMs: rerunInterval })
        await sleep(rerunInterval)
      }
    }
  }
}
