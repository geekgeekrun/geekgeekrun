import { ipcMain } from 'electron'
import { createCommonJobConditionConfigWindow } from '../window/commonJobConditionConfigWindow'
import { mainWindow } from '../window/mainWindow'

let commonJobConditionConfigWindow = null
export async function waitForCommonJobConditionDone() {
  return new Promise((resolve, reject) => {
    commonJobConditionConfigWindow = createCommonJobConditionConfigWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    let processDone = false
    function handler() {
      processDone = true
      commonJobConditionConfigWindow.close()
    }
    ipcMain.once('common-job-condition-config-done', handler)
    commonJobConditionConfigWindow.on('closed', async () => {
      ipcMain.off('common-job-condition-config-done', handler)
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('USER_CANCELLED'))
      }
    })
  })
}
