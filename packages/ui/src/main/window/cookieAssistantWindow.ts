import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createBrowserCompatibilityApi } from '../../../../ggr-backend/lib/services/browser/compat.mjs'

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
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })
  cookieAssistantWindow!.setAlwaysOnTop(true, 'normal')
  cookieAssistantWindow!.focus()
  cookieAssistantWindow!.setAlwaysOnTop(false)
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

  let loginBridge: ReturnType<typeof createBrowserCompatibilityApi> | null = null
  const sessionBridge = createBrowserCompatibilityApi()
  const saveSessionHandler = async (_ev: Electron.IpcMainInvokeEvent, { cookies }: { cookies: unknown }) => {
    return sessionBridge.saveSession({ cookies })
  }
  ipcMain.handle('save-boss-session', saveSessionHandler)
  const launchHandler = async (_ev) => {
    await loginBridge?.close().catch(() => {})
    loginBridge = createBrowserCompatibilityApi({
      onMessage: (data) => {
        switch (data.type) {
          case 'BOSS_ZHIPIN_COOKIE_COLLECTED':
            cookieAssistantWindow?.webContents.send(data.type, data)
            break
          case 'BOSS_ZHIPIN_LOGIN_PAGE_FAILED':
            cookieAssistantWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED')
            void loginBridge?.close().catch(() => {})
            loginBridge = null
            break
        }
      }
    })
    loginBridge.startLogin()
  }
  ipcMain.on('launch-bosszhipin-login-page-with-preload-extension', launchHandler)

  const killHandler = async () => {
    const current = loginBridge
    loginBridge = null
    await current?.close().catch(() => {})
  }
  ipcMain.on('kill-bosszhipin-login-page-with-preload-extension', killHandler)
  cookieAssistantWindow.on('closed', () => {
    void killHandler()
    void sessionBridge.close().catch(() => {})
    ipcMain.off('launch-bosszhipin-login-page-with-preload-extension', launchHandler)
    ipcMain.off('kill-bosszhipin-login-page-with-preload-extension', killHandler)
    ipcMain.removeHandler('save-boss-session')
  })

  return cookieAssistantWindow!
}
