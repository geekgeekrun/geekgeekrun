import { BrowserWindow } from 'electron'

export function openDevTools(win: BrowserWindow) {
  win.webContents.openDevTools()
}
