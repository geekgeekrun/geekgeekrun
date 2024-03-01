import { runAutoChat } from './flow/GEEK_AUTO_START_CHAT_WITH_BOSS'
import { openSettingWindow } from './flow/OPEN_SETTING_WINDOW'
import { checkAndDownloadDependenciesForInit } from './flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/index'
import { launchBossZhipinLoginPageWithPreloadExtension } from './flow/LAUNCH_BOSS_ZHIPIN_LOGIN_PAGE_WITH_PRELOAD_EXTENSION'

const runMode = process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE
switch (runMode) {
  case 'geekAutoStartWithBoss': {
    runAutoChat()
    break
  }
  case 'checkAndDownloadDependenciesForInit': {
    checkAndDownloadDependenciesForInit()
    break
  }
  case 'launchBossZhipinLoginPageWithPreloadExtension': {
    launchBossZhipinLoginPageWithPreloadExtension()
    break
  }
  default: {
    openSettingWindow()
    break
  }
}
