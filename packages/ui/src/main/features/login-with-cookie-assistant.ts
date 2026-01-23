import { ipcMain } from 'electron'
import { createCookieAssistantWindow, cookieAssistantWindow } from '../window/cookieAssistantWindow';

export async function loginWithCookieAssistant({ windowOption } = {}) {
  return new Promise((resolve, reject) => {
    createCookieAssistantWindow({ ...windowOption })

    let processDone = false
    ipcMain.once('cookie-saved', function handler() {
      processDone = true
      cookieAssistantWindow.close()
    })
    cookieAssistantWindow.once('closed', () => {
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('User cancelled login'))
      }
    })
  })
}
