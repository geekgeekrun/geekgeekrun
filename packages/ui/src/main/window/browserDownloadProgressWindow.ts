import { ChildProcess } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import * as JSONStream from 'JSONStream'
import * as fs from 'node:fs'
import { cacheDir } from '../constant'
import { EXPECT_CHROMIUM_BUILD_ID } from '../../common/constant'
import * as puppeteerManager from '@puppeteer/browsers'

export let browserDownloadProgressWindow: BrowserWindow | null = null

const registerHandleWithWindow = (
  win: BrowserWindow,
  ...args: Parameters<typeof ipcMain.handle>
) => {
  const [channel, handler] = args
  ipcMain.handle(channel, handler)
  win.once('closed', () => ipcMain.removeHandler(channel))
}

export function createBrowserDownloadProgressWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (browserDownloadProgressWindow) {
    browserDownloadProgressWindow!.close()
  }
  browserDownloadProgressWindow = new BrowserWindow({
    width: 600,
    height: 200,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  browserDownloadProgressWindow.on('ready-to-show', () => {
    browserDownloadProgressWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    browserDownloadProgressWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL'] + '#/browserDownloadProgress'
    )
  } else {
    browserDownloadProgressWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/browserDownloadProgress'
    )
  }

  let subProcessOfCheckAndDownloadDependencies: ChildProcess | null = null
  registerHandleWithWindow(browserDownloadProgressWindow, 'setup-dependencies', async () => {
    if (subProcessOfCheckAndDownloadDependencies) {
      return
    }
    subProcessOfCheckAndDownloadDependencies = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=downloadDependenciesForInit`],
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
              browserDownloadProgressWindow?.webContents.send(data.type, data)
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
        const executablePath = puppeteerManager.computeExecutablePath({
          browser: puppeteerManager.Browser.CHROME,
          cacheDir,
          buildId: EXPECT_CHROMIUM_BUILD_ID
        })
        if (exitCode === 0 && fs.existsSync(executablePath)) {
          resolve(executablePath)
        } else {
          reject('PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR')
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
  browserDownloadProgressWindow.once('closed', () => {
    killHandler()
  })
  browserDownloadProgressWindow.once('closed', () => {
    browserDownloadProgressWindow = null
  })

  return browserDownloadProgressWindow!
}
