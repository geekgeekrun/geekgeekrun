import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { createFirstLaunchNoticeApproveFlag } from '../features/first-launch-notice-window'

export let firstLaunchNoticeWindow: BrowserWindow | null = null
export function createFirstLaunchNoticeWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  firstLaunchNoticeWindow = new BrowserWindow({
    width: 960,
    height: 640,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    frame: false,
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

export const initIpc = () => {
  ipcMain.handle('first-launch-notice-approve', () => {
    createFirstLaunchNoticeApproveFlag()
    firstLaunchNoticeWindow?.close()
  })
  ipcMain.on('update-window-size', (ev, size: {
    width: number, height: number, animate?: boolean
  }) => {
    const win = BrowserWindow.fromWebContents(ev.sender)
    if (!win) {
      return
    }
    win.setSize(size.width, size.height, size.animate)
  } )
}
initIpc()
