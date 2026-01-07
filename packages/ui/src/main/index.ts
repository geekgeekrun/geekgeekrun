import minimist from 'minimist'
const isUiDev = process.env.NODE_ENV === 'development'
const commandlineArgs = minimist(isUiDev ? process.argv.slice(2) : process.argv.slice(1))
console.log(commandlineArgs)

const runMode = commandlineArgs['mode'];

;(async () => {
  switch (runMode) {
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
    case 'readNoReplyAutoReminder': {
      const { runEntry } = await import('./flow/READ_NO_REPLY_AUTO_REMINDER/index')
      runEntry()
      break
    }
    case 'launchDaemon': {
      await import('./flow/LAUNCH_DAEMON')
      break
    }
    default: {
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW/index')
      openSettingWindow()
      break
    }
  }
})()
