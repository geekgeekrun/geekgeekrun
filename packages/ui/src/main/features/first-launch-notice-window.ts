import fs from 'fs'
import os from 'os'
import path from 'path'
import buildInfo from '../../common/build-info.json'
import { ensureStorageFileExist } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import {
  createFirstLaunchNoticeWindow,
  firstLaunchNoticeWindow
} from '../window/firstLaunchNoticeWindow'
import { ipcMain } from 'electron'

export const firstLaunchNoticeApproveFlagPath = path.join(
  os.homedir(),
  '.geekgeekrun/storage',
  'ui-first-launch-notice-flag'
)

export const isFirstLaunchNoticeApproveFlagExist = () =>
  fs.existsSync(firstLaunchNoticeApproveFlagPath)
export const createFirstLaunchNoticeApproveFlag = () => {
  ensureStorageFileExist()
  fs.writeFileSync(firstLaunchNoticeApproveFlagPath, buildInfo.version)
}
export async function waitForUserApproveAgreement({ windowOption } = {}) {
  return new Promise((resolve, reject) => {
    createFirstLaunchNoticeWindow({ ...windowOption })
    let processDone = false
    function handler() {
      processDone = true
      firstLaunchNoticeWindow.close()
    }
    ipcMain.once('first-launch-notice-approve', handler)
    firstLaunchNoticeWindow.once('closed', () => {
      ipcMain.off('first-launch-notice-approve', handler)
      if (processDone) {
        resolve(true)
      } else {
        reject(new Error('USER_CANCELLED'))
      }
    })
  })
}
