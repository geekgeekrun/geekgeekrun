import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'

export let resumeEditorWindow: BrowserWindow | null = null
export function createResumeEditorWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (resumeEditorWindow) {
    resumeEditorWindow!.show()
  }
  resumeEditorWindow = new BrowserWindow({
    width: 960,
    height: 720,
    resizable: true,
    show: false,
    autoHideMenuBar: true,
    // frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    ...opt
  })

  resumeEditorWindow.on('ready-to-show', () => {
    resumeEditorWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    resumeEditorWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/resumeEditor')
  } else {
    resumeEditorWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/resumeEditor'
    )
  }

  resumeEditorWindow!.once('closed', () => {
    resumeEditorWindow = null
  })

  return resumeEditorWindow!
}
