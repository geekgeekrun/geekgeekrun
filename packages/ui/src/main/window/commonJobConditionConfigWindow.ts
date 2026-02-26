import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { writeConfigFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

export let commonJobConditionConfigWindow: BrowserWindow | null = null
export function createCommonJobConditionConfigWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (commonJobConditionConfigWindow) {
    commonJobConditionConfigWindow!.show()
  }
  commonJobConditionConfigWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  commonJobConditionConfigWindow.on('ready-to-show', () => {
    commonJobConditionConfigWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    commonJobConditionConfigWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL'] + '#/commonJobConditionConfig'
    )
  } else {
    commonJobConditionConfigWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/commonJobConditionConfig'
    )
  }

  commonJobConditionConfigWindow!.once('closed', () => {
    commonJobConditionConfigWindow = null
  })

  ipcMain.handle('save-common-job-condition-config', async (_ev, payload) => {
    await writeConfigFile('common-job-condition-config.json', payload)
    commonJobConditionConfigWindow!.close()
  })
  commonJobConditionConfigWindow!.once('closed', () => {
    ipcMain.removeHandler('save-common-job-condition-config')
  })

  return commonJobConditionConfigWindow!
}
