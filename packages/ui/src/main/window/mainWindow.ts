import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
export let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? {
          /* icon */
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.on('ready-to-show', async () => {
    process.env.NODE_ENV === 'development' &&
      setTimeout(() => {
        mainWindow && openDevTools(mainWindow)
      }, 500)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow!.once('closed', () => {
    mainWindow = null
  })
  daemonEE.on('message', (message) => {
    if (message.type === 'worker-to-gui-message') {
      mainWindow?.webContents?.send('worker-to-gui-message', message)
    }
  })
  daemonEE.on('error', (err) => {
    console.log(err)
  })
  return mainWindow!
}
