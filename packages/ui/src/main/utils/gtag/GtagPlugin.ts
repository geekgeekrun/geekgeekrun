import gtag from '.'

export default class GtagPlugin {
  apply(hooks) {
    hooks.newChatStartup.tap('GtagPlugin', (_, { chatStartupFrom }) => {
      gtag('new_chat_startup', { chatStartupFrom })
    })
    hooks.jobMarkedAsNotSuit.tap('GtagPlugin', (_, { markFrom }) => {
      gtag('job_marked_as_not_suit', { markFrom })
    })
    hooks.noPositionFoundForCurrentJob.tap('GtagPlugin', () => {
      gtag('no_position_found_for_current_job')
    })
    hooks.noPositionFoundAfterTraverseAllJob.tap('GtagPlugin', () => {
      gtag('no_position_found_after_traverse_all_job')
    })
  }
}
