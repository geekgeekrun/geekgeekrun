import { ChildProcess } from 'child_process'
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getAnyAvailablePuppeteerExecutable } from '../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable'
import * as childProcess from 'node:child_process'
import * as JSONStream from 'JSONStream'

export let cookieAssistantWindow: BrowserWindow | null = null
export function createCookieAssistantWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (cookieAssistantWindow) {
    cookieAssistantWindow!.show()
  }
  cookieAssistantWindow = new BrowserWindow({
    width: 960,
    height: 720,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  cookieAssistantWindow.on('ready-to-show', () => {
    cookieAssistantWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    cookieAssistantWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/cookieAssistant')
  } else {
    cookieAssistantWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/cookieAssistant'
    )
  }

  cookieAssistantWindow!.once('closed', () => {
    cookieAssistantWindow = null
  })

  let subProcessOfBossZhipinLoginPageWithPreloadExtension: ChildProcess | null = null
  const launchHandler = async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    }
    const subProcessEnv = {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: (await getAnyAvailablePuppeteerExecutable())!.executablePath
    }
    subProcessOfBossZhipinLoginPageWithPreloadExtension = childProcess.spawn(
      process.argv[0],
      [process.argv[1], `--mode=launchBossZhipinLoginPageWithPreloadExtension`],
      {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    subProcessOfBossZhipinLoginPageWithPreloadExtension!.stdio[3]!.pipe(JSONStream.parse()).on(
      'data',
      (raw) => {
        const data = raw
        switch (data.type) {
          case 'BOSS_ZHIPIN_COOKIE_COLLECTED': {
            cookieAssistantWindow?.webContents.send(data.type, data)
            break
          }
          default: {
            return
          }
        }
      }
    )

    subProcessOfBossZhipinLoginPageWithPreloadExtension!.once('exit', () => {
      cookieAssistantWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED')
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    })
  }
  ipcMain.on('launch-bosszhipin-login-page-with-preload-extension', launchHandler)

  const killHandler = async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    } finally {
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    }
  }
  ipcMain.on('kill-bosszhipin-login-page-with-preload-extension', killHandler)
  cookieAssistantWindow.on('closed', () => {
    subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    ipcMain.off('launch-bosszhipin-login-page-with-preload-extension', launchHandler)
    ipcMain.off('kill-bosszhipin-login-page-with-preload-extension', killHandler)
  })

  return cookieAssistantWindow!
}
