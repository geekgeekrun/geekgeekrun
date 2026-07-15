import overrideConsole from './utils/overrideConsole'
import { app, dialog } from 'electron'
import { openSettingWindow } from './flow/OPEN_SETTING_WINDOW/index'
import { ensureBackendReady, ensureSupervisorInstalled } from './backend/bootstrap'

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
void (async () => {
  while (true) {
    try {
      await ensureSupervisorInstalled()
      await ensureBackendReady()
      openSettingWindow({ headless: process.env.GGR_HEADLESS === 'true' })
      return
    } catch (error) {
      console.error('Backend bootstrap failed before opening the main window', error)
      const { response } = await dialog.showMessageBox({
        type: 'error',
        buttons: ['Retry', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        message: 'The backend could not be started.',
        detail: 'Retry after checking your network connection or backend release settings.'
      })
      if (response !== 0) {
        app.quit()
        return
      }
    }
  }
})()
