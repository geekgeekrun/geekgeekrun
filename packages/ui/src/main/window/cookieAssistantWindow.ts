import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { requestBackend } from '../backend/client'
import { backendEvents } from '../backend/events'
import { writeBackendConfig } from '../backend/register-ipc'

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

  let loginTaskId: string | undefined
  const saveSessionHandler = async (_ev: Electron.IpcMainInvokeEvent, { cookies }: { cookies: unknown }) => {
    await writeBackendConfig('boss_cookies', cookies)
    return { saved: true }
  }
  ipcMain.handle('save-boss-session', saveSessionHandler)
  const backendEventHandler = (event: { event?: string; data?: Record<string, unknown> }) => {
    const data = event.data
    if (event.event !== 'task.progress' || !data || data.taskId !== loginTaskId) return
    if (data.state === 'cookie-collected') {
      cookieAssistantWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_COMPLETED', data)
      ipcMain.emit('cookie-saved')
    }
    if (data.state === 'failed') {
      cookieAssistantWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED')
    }
  }
  backendEvents.on('event', backendEventHandler)
  const launchHandler = async () => {
    const task = await requestBackend<{ taskId: string }>('browser.openLogin')
    loginTaskId = task.taskId
  }
  ipcMain.on('launch-bosszhipin-login-page-with-preload-extension', launchHandler)

  const killHandler = async () => {
    if (loginTaskId) await requestBackend('browser.cancel', { taskId: loginTaskId })
    loginTaskId = undefined
  }
  ipcMain.on('kill-bosszhipin-login-page-with-preload-extension', killHandler)
  cookieAssistantWindow.on('closed', () => {
    void killHandler()
    backendEvents.off('event', backendEventHandler)
    ipcMain.off('launch-bosszhipin-login-page-with-preload-extension', launchHandler)
    ipcMain.off('kill-bosszhipin-login-page-with-preload-extension', killHandler)
    ipcMain.removeHandler('save-boss-session')
  })

  return cookieAssistantWindow!
}
