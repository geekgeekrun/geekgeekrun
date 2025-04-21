import { BrowserWindow } from 'electron'
import path from 'path'

export let readNoReplyReminderLlmMockWindow: BrowserWindow | null = null
export function createReadNoReplyReminderLlmMockWindow(
  opt?: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  // Create the browser window.
  if (readNoReplyReminderLlmMockWindow) {
    readNoReplyReminderLlmMockWindow!.show()
  }
  readNoReplyReminderLlmMockWindow = new BrowserWindow({
    width: 600,
    height: 800,
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

  readNoReplyReminderLlmMockWindow.on('ready-to-show', () => {
    readNoReplyReminderLlmMockWindow!.show()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    readNoReplyReminderLlmMockWindow.loadURL(
      process.env['ELECTRON_RENDERER_URL'] + '#/readNoReplyReminderLlmMock'
    )
  } else {
    readNoReplyReminderLlmMockWindow.loadURL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/readNoReplyReminderLlmMock'
    )
  }

  readNoReplyReminderLlmMockWindow!.once('closed', () => {
    readNoReplyReminderLlmMockWindow = null
  })

  return readNoReplyReminderLlmMockWindow!
}
