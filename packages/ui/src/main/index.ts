import { runAutoChat } from './flow/GEEK_AUTO_START_CHAT_WITH_BOSS'
import { openSettingWindow } from './flow/OPEN_SETTING_WINDOW'
import { checkAndDownloadDependenciesForInit } from './flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/index';
import { loginToBossZhipin } from './flow/LOGIN_TO_BOSS_ZHIPIN';

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
  case 'loginToBossZhipin': {
    loginToBossZhipin()
    break
  }
  default: {
    openSettingWindow()
    break
  }
}
