import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'

export let llmConfigWindow: BrowserWindow | null = null
export function createLlmConfigWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (llmConfigWindow) {
    llmConfigWindow!.show()
  }
  llmConfigWindow = new BrowserWindow({
    width: 576,
    height: 410,
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

  llmConfigWindow.on('ready-to-show', () => {
    llmConfigWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    llmConfigWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/llmConfig')
  } else {
    llmConfigWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/llmConfig'
    )
  }

  llmConfigWindow!.once('closed', () => {
    llmConfigWindow = null
  })

  return llmConfigWindow!
}
