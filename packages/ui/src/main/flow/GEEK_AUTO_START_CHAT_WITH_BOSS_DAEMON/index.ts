import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import childProcess from 'node:child_process'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import { app } from 'electron'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()
function runWithDaemon() {
  const subProcessOfCore = childProcess.spawn(process.argv[0], process.argv.slice(1), {
    stdio: [process.stdin, process.stdout, process.stderr, 'pipe', 'ipc'],
    env: {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'geekAutoStartWithBossMain'
    }
  })

  subProcessOfCore.once('exit', async (exitCode: number) => {
    if (
      [...Object.values(AUTO_CHAT_ERROR_EXIT_CODE)]
        .filter((it) => typeof it === 'number')
        .includes(exitCode)
    ) {
      console.log(
        `[Run core daemon] Child process exit with reason ${AUTO_CHAT_ERROR_EXIT_CODE[exitCode]}.`
      )
      process.exit(exitCode)
      return
    }
    console.log(
      `[Run core daemon] Child process exit with code ${exitCode}, an internal error may not be caught, and will be restarted in ${rerunInterval}ms.`
    )
    await sleep(rerunInterval)
    runWithDaemon()
  })
}
export function runAutoChatWithDaemon() {
  app.dock?.hide()
  process.on('disconnect', () => {
    app.exit()
  })
  runWithDaemon()
}
