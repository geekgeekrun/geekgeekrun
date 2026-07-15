import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import { backendEvents } from '../backend/events'

export let mainWindow: BrowserWindow | null = null
let shouldQuit = false

export function allowMainWindowQuit() {
  shouldQuit = true
}

export function showMainWindow() {
  if (!mainWindow) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

export function hideMainWindow() {
  mainWindow?.hide()
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow) {
    return mainWindow
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    show: false,
    autoHideMenuBar: true,
    frame: true,
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
    // 在 headless 模式下不显示 Dashboard 窗口，日志走终端
    if (process.env.GGR_HEADLESS !== 'true') {
      mainWindow?.show()
    }
  })
  mainWindow.on('ready-to-show', async () => {
    process.env.NODE_ENV === 'development' &&
      setTimeout(() => {
        mainWindow && openDevTools(mainWindow)
      }, 500)
  })

  mainWindow.on('close', (event) => {
    if (!shouldQuit) {
      event.preventDefault()
      hideMainWindow()
    }
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
  backendEvents.on('event', (event: { event?: string; data?: Record<string, unknown> }) => {
    if (event.event === 'task.progress' || event.event === 'approval.required') {
      const message = {
        type: 'worker-to-gui-message',
        workerId: event.data?.workerId,
        data: event.event === 'approval.required'
          ? { type: 'approval-required', ...event.data }
          : event.data
      }
      mainWindow?.webContents?.send('worker-to-gui-message', message)
      // headless 模式下日志打到终端
      if (process.env.GGR_HEADLESS === 'true') {
        const data = message.data
        if (typeof data === 'string') {
          console.log(`[worker] ${data}`)
        } else if (data?.message) {
          console.log(`[worker] ${data.message}`)
        }
      }
    }
  })
  return mainWindow!
}
