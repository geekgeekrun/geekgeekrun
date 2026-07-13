import overrideConsole from './utils/overrideConsole'
import { openSettingWindow } from './flow/OPEN_SETTING_WINDOW/index'

const isUiDev = process.env.NODE_ENV === 'development'
const enableLogToFile = process.env.GEEKGEEKRUN_ENABLE_LOG_TO_FILE === String(1)
if (isUiDev || enableLogToFile) {
  overrideConsole()
}
console.log('NODE_ENV:', process.env.NODE_ENV)

// 捕获未处理的 EPIPE 错误
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') {
    return
  }
  throw err
})

globalThis.GEEKGEEKRUN_PROCESS_ROLE = 'ui'
openSettingWindow({ headless: process.env.GGR_HEADLESS === 'true' })
