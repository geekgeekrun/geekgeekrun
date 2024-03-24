const runMode = process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE

;(async () => {
  switch (runMode) {
    case 'geekAutoStartWithBossMain': {
      const { runAutoChat } = await import('./flow/GEEK_AUTO_START_CHAT_WITH_BOSS_MAIN/index')
      runAutoChat()
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
    default: {
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW')
      openSettingWindow()
      break
    }
  }
})()
