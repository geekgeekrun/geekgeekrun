import fs from 'fs'
import os from 'os'
import path from 'path'
import buildInfo from '../../common/build-info.json'

export const firstLaunchNoticeApproveFlagPath = path.join(
  os.homedir(),
  '.geekgeekrun/storage',
  'ui-first-launch-notice-flag'
)

export const isFirstLaunchNoticeApproveFlagExist = () => fs.existsSync(firstLaunchNoticeApproveFlagPath)
export const createFirstLaunchNoticeApproveFlag = () =>
  fs.writeFileSync(firstLaunchNoticeApproveFlagPath, buildInfo.version)
