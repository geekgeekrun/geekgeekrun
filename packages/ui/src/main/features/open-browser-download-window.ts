import { ipcMain } from 'electron'
import {
  createBrowserDownloadProgressWindow,
  browserDownloadProgressWindow
} from '../window/browserDownloadProgressWindow'

export async function openBrowserDownloadWindow({ windowOption } = {}) {
  return new Promise((resolve, reject) => {
    createBrowserDownloadProgressWindow({ ...windowOption })

    let processDone = false
    let pathOfDownloadedBrowser = null
    function handler(_, executablePath) {
      pathOfDownloadedBrowser = executablePath
      processDone = true
      browserDownloadProgressWindow.close()
    }
    ipcMain.once('browser-download-done', handler)
    browserDownloadProgressWindow.once('closed', () => {
      ipcMain.off('browser-download-done', handler)
      if (processDone) {
        resolve(pathOfDownloadedBrowser)
      } else {
        reject(new Error('USER_CANCELLED_CONFIG_BROWSER'))
      }
    })
  })
}
