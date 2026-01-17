import minimist from 'minimist'
import { runCommon } from './features/run-common';
import { launchDaemon } from './flow/OPEN_SETTING_WINDOW/launch-daemon';
import { connectToDaemon } from './flow/OPEN_SETTING_WINDOW/connect-to-daemon';
import { randomUUID } from 'crypto';
const isUiDev = process.env.NODE_ENV === 'development'
const commandlineArgs = minimist(isUiDev ? process.argv.slice(2) : process.argv.slice(1))
console.log(commandlineArgs)

const runMode = commandlineArgs['mode'];

;(async () => {
  switch (runMode) {
    // #region internal use
    case 'geekAutoStartWithBossMain': {
      const { waitForProcessHandShakeAndRunAutoChat } = await import(
        './flow/GEEK_AUTO_START_CHAT_WITH_BOSS_MAIN/index'
      )
      waitForProcessHandShakeAndRunAutoChat()
      break
    }
    case 'checkAndDownloadDependenciesForInit': {
      const { checkAndDownloadDependenciesForInit } = await import(
        './flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/index'
      )
      checkAndDownloadDependenciesForInit()
      break
    }
    case 'launchBossZhipinLoginPageWithPreloadExtension': {
      const { launchBossZhipinLoginPageWithPreloadExtension } = await import(
        './flow/LAUNCH_BOSS_ZHIPIN_LOGIN_PAGE_WITH_PRELOAD_EXTENSION'
      )
      launchBossZhipinLoginPageWithPreloadExtension()
      break
    }
    case 'launchBossSite': {
      const { launchBossSite } = await import('./flow/LAUNCH_BOSS_SITE')
      launchBossSite()
      break
    }
    case 'readNoReplyAutoReminderMain': {
      const { runEntry } = await import('./flow/READ_NO_REPLY_AUTO_REMINDER/index')
      runEntry()
      break
    }
    case 'launchDaemon': {
      await import('./flow/LAUNCH_DAEMON')
      break
    }
    // #endregion

    // #region user entry
    case 'geekAutoStartWithBoss': {
      process.env.GEEKGEEKRUND_PIPE_NAME = `geekgeekrun-d_${randomUUID()}`
      await launchDaemon()
      await connectToDaemon()
      await runCommon({ mode: 'geekAutoStartWithBossMain' })
      break
    }
    case 'readNoReplyAutoReminder': {
      process.env.GEEKGEEKRUND_PIPE_NAME = `geekgeekrun-d_${randomUUID()}`
      await launchDaemon()
      await connectToDaemon()
      await runCommon({ mode: 'readNoReplyAutoReminderMain' })
      break
    }
    default: {
      process.env.GEEKGEEKRUND_PIPE_NAME = `geekgeekrun-d_${randomUUID()}`
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW/index')
      openSettingWindow()
      break
    }
    // #region
  }
})()
