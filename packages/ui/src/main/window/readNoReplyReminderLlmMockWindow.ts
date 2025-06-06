import { BrowserWindow } from 'electron'
import path from 'path'
import { URL } from 'node:url'

export let readNoReplyReminderLlmMockWindow: BrowserWindow | null = null
export function createReadNoReplyReminderLlmMockWindow(
  opt?: Electron.BrowserWindowConstructorOptions,
  { autoReminderConfig } = {}
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
  let urlObj: URL
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    urlObj = new URL(process.env['ELECTRON_RENDERER_URL'] + '#/readNoReplyReminderLlmMock')
  } else {
    urlObj = new URL(
      'file://' + path.join(__dirname, '../renderer/index.html') + '#/readNoReplyReminderLlmMock'
    )
  }

  for (const [k, v] of Object.entries(autoReminderConfig || {})) {
    urlObj.searchParams.append(k, v)
  }
  readNoReplyReminderLlmMockWindow.loadURL(String(urlObj))
  readNoReplyReminderLlmMockWindow!.once('closed', () => {
    readNoReplyReminderLlmMockWindow = null
  })

  return readNoReplyReminderLlmMockWindow!
}
