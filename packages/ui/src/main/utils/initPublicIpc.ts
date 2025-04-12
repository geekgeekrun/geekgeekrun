import { BrowserWindow, ipcMain } from 'electron'

export default function initPublicIpc() {
  ipcMain.on(
    'update-window-size',
    (
      ev,
      size: {
        width: number
        height: number
        animate?: boolean
      }
    ) => {
      const win = BrowserWindow.fromWebContents(ev.sender)
      if (!win) {
        return
      }
      win.setSize(size.width, size.height, size.animate)
    }
  )
}
