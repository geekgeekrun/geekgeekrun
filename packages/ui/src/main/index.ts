import { runAutoChat } from './flow/GEEK_AUTO_START_CHAT_WITH_BOSS'
import { openSettingWindow } from './flow/OPEN_SETTING_WINDOW'

const runMode = process.env.BOSSGEEKGO_RUN_MODE
switch (runMode) {
  case 'geekAutoStartWithBoss': {
    runAutoChat()
    break
  }
  default: {
    openSettingWindow()
    break
  }
}
