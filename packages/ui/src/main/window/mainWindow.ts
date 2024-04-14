import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import { createFirstLaunchNoticeWindow } from './firstLaunchNoticeWindow'
import { isFirstLaunchNoticeApproveFlagExist } from '../features/first-launch-notice-window'
export let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
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

  process.env.NODE_ENV === 'development' && openDevTools(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })
  mainWindow.on('ready-to-show', async () => {
    !isFirstLaunchNoticeApproveFlagExist() &&
      createFirstLaunchNoticeWindow({
        parent: mainWindow!,
        modal: true,
        show: true
      })
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
  return mainWindow!
}
