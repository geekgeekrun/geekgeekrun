import minimist from 'minimist'
import { runCommon } from './features/run-common';
import { ensureIpcPipeName, launchDaemon } from './flow/OPEN_SETTING_WINDOW/launch-daemon';

// 捕获未处理的 EPIPE 错误
process.on('uncaughtException', (err) => {
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') {
    return
  }
  throw err
});

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
      const { runEntry } = await import('./flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/index')
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
      await ensureIpcPipeName()
      await launchDaemon()
      await runCommon({ mode: 'geekAutoStartWithBossMain' })
      break
    }
    case 'readNoReplyAutoReminder': {
      await ensureIpcPipeName()
      await launchDaemon()
      await runCommon({ mode: 'readNoReplyAutoReminderMain' })
      break
    }
    default: {
      await ensureIpcPipeName()
      await launchDaemon()
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW/index')
      openSettingWindow()
      break
    }
    // #region
  }
})()
