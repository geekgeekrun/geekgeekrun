import gtag from '.'

export default class GtagPlugin {
  apply(hooks) {
    hooks.newChatStartup.tap('GtagPlugin', (jobData, { chatStartupFrom }) => {
      gtag('new_chat_startup', {
        chatStartupFrom,
        encryptJobId: jobData.jobInfo.encryptId
      })
    })
    hooks.jobMarkedAsNotSuit.tap('GtagPlugin', (jobData, { markFrom, markOp, markReason }) => {
      gtag('job_marked_as_not_suit', {
        markFrom,
        markOp,
        markReason,
        bossActiveTimeDesc: jobData.bossInfo.activeTimeDesc,
        encryptJobId: jobData.jobInfo.encryptId
      })
    })
    hooks.noPositionFoundForCurrentJob.tap('GtagPlugin', () => {
      gtag('no_position_found_for_current_job')
    })
    hooks.noPositionFoundAfterTraverseAllJob.tap('GtagPlugin', () => {
      gtag('no_position_found_after_traverse_all_job')
    })
    hooks.encounterEmptyRecommendJobList.tap('GtagPlugin', ({ pageQuery }) => {
      gtag('encounter_empty_rec_job_list', { pageQuery })
    })
  }
}
