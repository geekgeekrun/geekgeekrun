import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { requestBackend } from '../backend/client'
import { backendEvents } from '../backend/events'

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

  let downloadPromise: Promise<string> | null = null
  let activeDownload: { taskId: string; reject: (error: Error) => void; removeListener: () => void } | null = null
  registerHandleWithWindow(browserDownloadProgressWindow, 'setup-dependencies', async () => {
    downloadPromise ??= new Promise<string>(async (resolve, reject) => {
      try {
        const task = await requestBackend<{ taskId: string }>('browser.openLogin')
        const eventHandler = (event: { event?: string; data?: Record<string, unknown> }) => {
          const data = event.data
          if (event.event !== 'task.progress' || data?.taskId !== task.taskId) return
          if (data.state === 'dependency-download-progress') {
            browserDownloadProgressWindow?.webContents.send('PUPPETEER_DOWNLOAD_PROGRESS', data)
            return
          }
          if (data.state === 'dependency-ready' && typeof data.executablePath === 'string') {
            cleanup()
            void requestBackend('browser.cancel', { taskId: task.taskId }).catch(() => {})
            resolve(data.executablePath)
            return
          }
          if (data.state === 'failed' || data.state === 'cancelled') {
            cleanup()
            reject(new Error(String(data.message ?? 'Browser dependency setup failed')))
          }
        }
        const cleanup = () => {
          backendEvents.off('event', eventHandler)
          if (activeDownload?.taskId === task.taskId) activeDownload = null
        }
        activeDownload = { taskId: task.taskId, reject, removeListener: cleanup }
        backendEvents.on('event', eventHandler)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }).finally(() => {
      downloadPromise = null
    })
    return await downloadPromise
  })
  browserDownloadProgressWindow.once('closed', () => {
    const current = activeDownload
    activeDownload = null
    current?.removeListener()
    if (current) {
      current.reject(new Error('USER_CANCELLED_CONFIG_BROWSER'))
      void requestBackend('browser.cancel', { taskId: current.taskId }).catch(() => {})
    }
    browserDownloadProgressWindow = null
  })

  return browserDownloadProgressWindow!
}
