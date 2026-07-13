import {
  saveJobInfoFromRecommendPage, saveChatStartupRecord, saveMarkAsNotSuitRecord,
  saveChatMessageRecord, saveJobHireStatusRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers.js'
import { MarkAsNotSuitReason, JobSource } from '@geekgeekrun/sqlite-plugin/dist/enums.js'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog.js'
import { BossInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/BossInfo.js'

export function createBrowserRecords({ getDataSource }) {
  if (typeof getDataSource !== 'function') throw new TypeError('getDataSource is required')
  return {
    async saveJobInfo(value) { return saveJobInfoFromRecommendPage(await getDataSource(), value) },
    async saveHireStatus(value) { return saveJobHireStatusRecord(await getDataSource(), { ...value, lastSeenDate: new Date() }) },
    async saveNotSuitable({ job, user, code, reason, jobSource }) {
      const detail = {
        markFrom: ChatStartupFrom.ManuallyFromRecommendList,
        extInfo: { chosenReasonInUi: { code, text: reason } },
        markReason: MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON,
        jobSource: JobSource[jobSource]
      }
      if (reason?.includes('活跃度低')) {
        detail.markReason = MarkAsNotSuitReason.BOSS_INACTIVE
        detail.extInfo.bossActiveTimeDesc = job?.bossInfo?.activeTimeDesc
      }
      return saveMarkAsNotSuitRecord(await getDataSource(), job, { encryptUserId: user.encryptUserId }, detail)
    },
    async saveChatStartup({ job, user, jobSource }) {
      return saveChatStartupRecord(await getDataSource(), job, { encryptUserId: user.encryptUserId }, {
        chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList, jobSource: JobSource[jobSource]
      })
    },
    async saveBoss(value) {
      const repository = (await getDataSource()).getRepository(BossInfo)
      if (await repository.findOneBy({ encryptBossId: value.encryptBossId })) return
      await repository.save(Object.assign(new BossInfo(), {
        encryptBossId: value.encryptBossId, name: value.name, title: value.title, date: new Date()
      }))
    },
    async saveChatMessages(values) { return saveChatMessageRecord(await getDataSource(), values) }
  }
}
