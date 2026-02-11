import { ipcMain } from 'electron'
import {
  createBrowserAssistantWindow,
  browserAssistantWindow
} from '../window/browserAssistantWindow'

export async function configWithBrowserAssistant({ windowOption, autoFind } = {}) {
  return new Promise((resolve, reject) => {
    createBrowserAssistantWindow({ ...windowOption }, { autoFind })

    let processDone = false
    function handler() {
      processDone = true
      browserAssistantWindow.close()
    }
    ipcMain.once('browser-config-saved', handler)
    browserAssistantWindow.once('closed', () => {
      ipcMain.off('browser-config-saved', handler)
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('USER_CANCELLED_CONFIG_BROWSER'))
      }
    })
  })
}
