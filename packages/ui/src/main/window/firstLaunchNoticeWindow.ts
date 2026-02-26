import { BrowserWindow } from 'electron'
import path from 'path'

export let firstLaunchNoticeWindow: BrowserWindow | null = null
export function createFirstLaunchNoticeWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  firstLaunchNoticeWindow = new BrowserWindow({
    width: 960,
    maxWidth: 960,
    minHeight: 320,
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

  firstLaunchNoticeWindow.on('ready-to-show', () => {
    firstLaunchNoticeWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    firstLaunchNoticeWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/first-run-readme')
  } else {
    firstLaunchNoticeWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/first-run-readme'
    )
  }

  firstLaunchNoticeWindow!.once('closed', () => {
    firstLaunchNoticeWindow = null
  })

  return firstLaunchNoticeWindow!
}
