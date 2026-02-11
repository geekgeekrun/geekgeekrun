import { ipcMain } from 'electron'
import { createCookieAssistantWindow, cookieAssistantWindow } from '../window/cookieAssistantWindow';

export async function loginWithCookieAssistant({ windowOption } = {}) {
  return new Promise((resolve, reject) => {
    createCookieAssistantWindow({ ...windowOption })

    let processDone = false
    function handler() {
      processDone = true
      cookieAssistantWindow.close()
    }
    ipcMain.once('cookie-saved', handler)
    cookieAssistantWindow.once('closed', () => {
      ipcMain.off('cookie-saved', handler)
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('USER_CANCELLED_LOGIN'))
      }
    })
  })
}
