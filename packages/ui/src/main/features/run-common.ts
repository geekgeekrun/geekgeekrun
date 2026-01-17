import { AUTO_CHAT_ERROR_EXIT_CODE } from "../../common/enums/auto-start-chat"
import { sendToDaemon } from "../flow/OPEN_SETTING_WINDOW/connect-to-daemon"
import { saveAndGetCurrentRunRecord } from "../flow/OPEN_SETTING_WINDOW/utils/db"

export async function runCommon ({ mode }) {
    const currentRunRecord = (await saveAndGetCurrentRunRecord())?.data
    const subProcessEnv = {
      ...process.env,
      GEEKGEEKRUND_NO_AUTO_RESTART_EXIT_CODE: [
        AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE,
        AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID,
        AUTO_CHAT_ERROR_EXIT_CODE.LLM_UNAVAILABLE
      ].join(',')
    }
    const args = process.env.NODE_ENV === 'development' ? [
      process.argv[1],
      `--mode=${mode}`,
      `--run-record-id=${currentRunRecord?.id || 0}`
    ] : [
      `--mode=${mode}`,
      `--run-record-id=${currentRunRecord?.id || 0}`
    ]
    await sendToDaemon(
      {
        type: 'start-worker',
        workerId: mode,
        command: process.argv[0],
        args,
        env: subProcessEnv
      },
      {
        needCallback: true
      }
    )
}