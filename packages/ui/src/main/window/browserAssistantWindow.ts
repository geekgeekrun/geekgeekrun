import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getAnyAvailablePuppeteerExecutable } from '../flow/DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable'
import {
  getLastUsedAndAvailableBrowser,
  saveLastUsedAndAvailableBrowserInfo
} from '../flow/DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { openBrowserDownloadWindow } from '../features/open-browser-download-window'

export let browserAssistantWindow: BrowserWindow | null = null

const registerHandleWithWindow = (
  win: BrowserWindow,
  ...args: Parameters<typeof ipcMain.handle>
) => {
  const [channel, handler] = args
  ipcMain.handle(channel, handler)
  win.once('closed', () => ipcMain.removeHandler(channel))
}

export function createBrowserAssistantWindow(
  opt?: Electron.BrowserWindowConstructorOptions,
  { autoFind } = {}
): BrowserWindow {
  // Create the browser window.
  if (browserAssistantWindow) {
    browserAssistantWindow!.close()
  }
  browserAssistantWindow = new BrowserWindow({
    width: 800,
    minWidth: 800,
    height: 400,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  browserAssistantWindow.on('ready-to-show', () => {
    browserAssistantWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  let routePath = '#/browserAssistant'
  if (autoFind) {
    routePath = '#/browserAutoFind'
  }
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    browserAssistantWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + routePath)
  } else {
    browserAssistantWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + routePath
    )
  }

  browserAssistantWindow!.once('closed', () => {
    browserAssistantWindow = null
  })

  registerHandleWithWindow(
    browserAssistantWindow,
    'get-any-available-puppeteer-executable',
    async (_, { ignoreCached, noSave } = {}) => {
      return await getAnyAvailablePuppeteerExecutable({ ignoreCached, noSave })
    }
  )

  registerHandleWithWindow(
    browserAssistantWindow,
    'get-last-used-and-available-browser',
    async () => {
      return await getLastUsedAndAvailableBrowser()
    }
  )

  registerHandleWithWindow(
    browserAssistantWindow,
    'save-last-used-and-available-browser-info',
    async (_, payload) => {
      return await saveLastUsedAndAvailableBrowserInfo(payload)
    }
  )

  registerHandleWithWindow(browserAssistantWindow, 'download-browser-with-downloader', async () => {
    return await openBrowserDownloadWindow({
      windowOption: {
        parent: browserAssistantWindow!,
        modal: true,
        show: true
      }
    })
  })

  return browserAssistantWindow!
}
