const runMode = process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE

;(async () => {
  switch (runMode) {
    case 'geekAutoStartWithBossMain': {
      const { waitForProcessHandShakeAndRunAutoChat } = await import(
        './flow/GEEK_AUTO_START_CHAT_WITH_BOSS_MAIN/index'
      )
      waitForProcessHandShakeAndRunAutoChat()
      break
    }
    case 'geekAutoStartWithBossDaemon': {
      const { runAutoChatWithDaemon } = await import(
        './flow/GEEK_AUTO_START_CHAT_WITH_BOSS_DAEMON/index'
      )
      runAutoChatWithDaemon()
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
    default: {
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW/index')
      openSettingWindow()
      break
    }
  }
})()
