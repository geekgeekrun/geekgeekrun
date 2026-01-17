import { sendToDaemon } from "../flow/OPEN_SETTING_WINDOW/connect-to-daemon"
import minimist from 'minimist'

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
export function pushUserInfoValidStatus (userInfoResponse) {
  sendToDaemon({
    type: 'worker-to-gui-message',
    data: {
      type: 'prerequisite-step-by-step-checkstep-by-step-check',
      step: {
        id: 'login-status-check',
        status: userInfoResponse.code === 0 ? 'fulfilled' : 'rejected'
      },
      runRecordId
    }
  })
}

export class UserResponseInfoPlugin {
  apply(hooks) {
    hooks.userInfoResponse.tapPromise(
      "UserResponseInfoPlugin",
      (userInfoResponse) => {
        pushUserInfoValidStatus(userInfoResponse)
        return Promise.resolve()
      }
    )
  }
}