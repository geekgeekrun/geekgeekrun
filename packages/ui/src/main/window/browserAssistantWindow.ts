import { ChildProcess } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getAnyAvailablePuppeteerExecutable } from '../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable'
import * as childProcess from 'node:child_process'
import * as JSONStream from 'JSONStream'
import {
  getLastUsedAndAvailableBrowser,
  saveLastUsedAndAvailableBrowserInfo
} from '../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/browser-history'

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
  opt?: Electron.BrowserWindowConstructorOptions
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
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    browserAssistantWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/browserAssistant')
  } else {
    browserAssistantWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/browserAssistant'
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

  let subProcessOfCheckAndDownloadDependencies: ChildProcess | null = null
  registerHandleWithWindow(browserAssistantWindow, 'setup-dependencies', async () => {
    if (subProcessOfCheckAndDownloadDependencies) {
      return
    }
    subProcessOfCheckAndDownloadDependencies = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=checkAndDownloadDependenciesForInit`],
      {
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    return new Promise((resolve, reject) => {
      subProcessOfCheckAndDownloadDependencies!.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        (raw) => {
          const data = raw
          switch (data.type) {
            case 'NEED_RESETUP_DEPENDENCIES':
            case 'PUPPETEER_DOWNLOAD_PROGRESS': {
              browserAssistantWindow?.webContents.send(data.type, data)
              break
            }
            case 'PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR': {
              console.error(data)
              break
            }
            default: {
              return
            }
          }
        }
      )
      subProcessOfCheckAndDownloadDependencies!.once('exit', (exitCode) => {
        switch (exitCode) {
          case 0: {
            resolve(exitCode)
            break
          }
          default: {
            reject('PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR')
            break
          }
        }
        subProcessOfCheckAndDownloadDependencies = null
      })
    })
  })

  const killHandler = async () => {
    try {
      subProcessOfCheckAndDownloadDependencies?.kill()
    } catch {
      //
    } finally {
      subProcessOfCheckAndDownloadDependencies = null
    }
  }
  browserAssistantWindow.once('closed', () => {
    killHandler()
  })

  return browserAssistantWindow!
}
