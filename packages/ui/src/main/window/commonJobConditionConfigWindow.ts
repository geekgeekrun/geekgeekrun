import { BrowserWindow } from 'electron'
import path from 'path'

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

  return commonJobConditionConfigWindow!
}
