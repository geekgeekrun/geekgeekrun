import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import {
  createFirstLaunchNoticeApproveFlag,
  isFirstLaunchNoticeApproveFlagExist,
  waitForUserApproveAgreement
} from '../features/first-launch-notice-window'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import { getLastUsedAndAvailableBrowser } from '../flow/DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { configWithBrowserAssistant } from '../features/config-with-browser-assistant'
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
    if (!isFirstLaunchNoticeApproveFlagExist()) {
      try {
        await waitForUserApproveAgreement({
          windowOption: {
            parent: mainWindow!,
            modal: true,
            show: true
          }
        })
        createFirstLaunchNoticeApproveFlag()
      } catch {
        app.exit(0)
        return
      }
    }
    const lastBrowser = await getLastUsedAndAvailableBrowser()
    if (!lastBrowser) {
      try {
        await configWithBrowserAssistant({
          windowOption: {
            parent: mainWindow!,
            modal: true,
            show: true
          },
          autoFind: true
        })
      } catch (err) {}
    }
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
