import path from 'node:path'
import { sleep } from '@geekgeekrun/utils/dist/sleep'
import childProcess from 'node:child_process'
import { AUTO_CHAT_ERROR_EXIT_CODE } from './enums'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()

function runWithDaemon(): void {
  const subProcessOfCore = childProcess.spawn(
    `node`,
    [path.join(
      __dirname,
      'main.js'
    )],
    {
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc'],
      env: {
        ...process.env,
        MAIN_BOSSGEEKGO_RERUN_INTERVAL: String(rerunInterval)
      }
    }
  )

  subProcessOfCore.once(
    'exit',
    async (exitCode: number | null) => {
      const validExitCode = exitCode ?? 0
      const exitCodes = Object.values(AUTO_CHAT_ERROR_EXIT_CODE)
        .filter((it): it is number => typeof it === 'number')

      if (exitCodes.includes(validExitCode)) {
        console.log(`[Run core daemon] Child process exit with reason ${(AUTO_CHAT_ERROR_EXIT_CODE as Record<number, string>)[validExitCode]}.`)
        process.exit(validExitCode)
        return
      }
      console.log(`[Run core daemon] Child process exit with code ${validExitCode}, an internal error may not be caught, and will be restarted in ${rerunInterval}ms.`)
      await sleep(rerunInterval)
      runWithDaemon()
    }
  )
}

runWithDaemon()
