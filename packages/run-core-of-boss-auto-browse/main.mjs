import startBossAutoBrowse from '@geekgeekrun/boss-auto-browse-and-chat/index.mjs'
import { readConfigFile } from '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
import {
  AsyncSeriesHook,
  AsyncSeriesWaterfallHook
} from 'tapable'
import path from 'node:path'
import { readStorageFile, storageFilePath } from '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'

const getPublicDbFilePath = () => path.join(storageFilePath, 'public.db')
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { BOSS_AUTO_ERROR_EXIT_CODE } from './enums.mjs'

import SqlitePluginModule from '@geekgeekrun/sqlite-plugin'
const { default: SqlitePlugin } = SqlitePluginModule

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSS_AUTO_BROWSE_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }
  return v
})()

process.on('disconnect', () => {
  process.exit()
})

const bossCookies = readStorageFile('boss-cookies.json')

console.log('[run-core-of-boss-auto][debug] readStorageFile(boss-cookies.json) result meta', {
  isArray: Array.isArray(bossCookies),
  length: Array.isArray(bossCookies) ? bossCookies.length : null,
  sampleDomains: Array.isArray(bossCookies)
    ? [...new Set(bossCookies.slice(0, 5).map(x => x && x.domain).filter(Boolean))]
    : null
})

const initPlugins = (hooks) => {
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
}

const main = async () => {
  if (!bossCookies?.length) {
    console.error('There is no cookies. You can save a copy with EditThisCookie extension.')
    process.exit(BOSS_AUTO_ERROR_EXIT_CODE.COOKIE_INVALID)
  }
  const hooks = {
    beforeBrowserLaunch: new AsyncSeriesHook(),
    afterBrowserLaunch: new AsyncSeriesHook(),
    beforeNavigateToRecommend: new AsyncSeriesHook(),
    onCandidateListLoaded: new AsyncSeriesHook(),
    onCandidateFiltered: new AsyncSeriesWaterfallHook(['candidates', 'filterResult']),
    beforeStartChat: new AsyncSeriesHook(['candidate']),
    afterChatStarted: new AsyncSeriesHook(['candidate', 'result']),
    onError: new AsyncSeriesHook(['error']),
    onComplete: new AsyncSeriesHook()
  }
  initPlugins(hooks)
  while (true) {
    try {
      await startBossAutoBrowse(hooks)
      const cfg = readConfigFile('boss-recruiter.json') || {}
      if (cfg?.recommendPage?.runOnceAfterComplete) {
        console.log('[Run core main] runOnceAfterComplete is true, exiting after one run.')
        break
      }
      const rerunMs = cfg?.recommendPage?.rerunIntervalMs ?? rerunInterval
      console.log(`[Run core main] Run completed normally. Next run in ${rerunMs}ms.`)
      await sleep(rerunMs)
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          process.exit(BOSS_AUTO_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
          break
        }
        if (err.message.includes('ERR_INTERNET_DISCONNECTED')) {
          process.exit(BOSS_AUTO_ERROR_EXIT_CODE.ERR_INTERNET_DISCONNECTED)
          break
        }
        if (err.message.includes('ACCESS_IS_DENIED')) {
          process.exit(BOSS_AUTO_ERROR_EXIT_CODE.ACCESS_IS_DENIED)
          break
        }
      }
      console.error(err)
      const errCfg = readConfigFile('boss-recruiter.json') || {}
      const errRerunMs = errCfg?.recommendPage?.rerunIntervalMs ?? rerunInterval
      console.log(`[Run core main] An internal error is caught, and browser will be restarted in ${errRerunMs}ms.`)
      await sleep(errRerunMs)
    }
  }
}

;(async () => {
  try {
    await main()
  } catch (err) {
    console.error(err)
  }
})()
