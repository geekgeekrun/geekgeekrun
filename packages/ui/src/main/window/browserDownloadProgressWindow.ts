import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { downloadDependenciesForInit } from '../../../../ggr-backend/lib/services/browser/compat-dependencies.mjs'

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
  registerHandleWithWindow(browserDownloadProgressWindow, 'setup-dependencies', async () => {
    downloadPromise ??= downloadDependenciesForInit({
      output: {
        write(raw: string) {
          for (const line of raw.split('\n')) {
            if (!line) continue
            try {
              const event = JSON.parse(line)
              browserDownloadProgressWindow?.webContents.send(event.type, event)
            } catch {
              // Ignore malformed progress data from the backend compatibility flow.
            }
          }
        }
      }
    }).finally(() => {
      downloadPromise = null
    })
    return await downloadPromise
  })
  browserDownloadProgressWindow.once('closed', () => {
    browserDownloadProgressWindow = null
  })

  return browserDownloadProgressWindow!
}
