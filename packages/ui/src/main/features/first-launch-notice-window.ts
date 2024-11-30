import fs from 'fs'
import os from 'os'
import path from 'path'
import buildInfo from '../../common/build-info.json'
import { ensureStorageFileExist } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

export const firstLaunchNoticeApproveFlagPath = path.join(
  os.homedir(),
  '.geekgeekrun/storage',
  'ui-first-launch-notice-flag'
)

export const isFirstLaunchNoticeApproveFlagExist = () => fs.existsSync(firstLaunchNoticeApproveFlagPath)
export const createFirstLaunchNoticeApproveFlag = () => {
  ensureStorageFileExist()
  fs.writeFileSync(firstLaunchNoticeApproveFlagPath, buildInfo.version)
}
