import path from 'node:path'
import * as url from 'url'
import { sleep } from '@geekgeekrun/utils/sleep.mjs';
import childProcess from 'node:child_process';
import { AUTO_CHAT_ERROR_EXIT_CODE } from './enums.mjs'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
function runWithDaemon () {
  const subProcessOfCore = childProcess.spawn(
    `node`,
    [path.join(
      __dirname,
      'main.mjs'
    )],
    {
      stdio: [process.stdin, process.stdout, process.stderr, 'pipe', 'ipc'],
      env: {
        ...process.env,
        MAIN_BOSSGEEKGO_RERUN_INTERVAL: rerunInterval
      }
    }
  )

  subProcessOfCore.once(
    'exit',
    async (exitCode) => {
      if (
        [
          ...Object.values(AUTO_CHAT_ERROR_EXIT_CODE)
        ].filter(it => typeof it === 'number').includes(exitCode)
      ) {
        console.log(`[Run core daemon] Child process exit with reason ${AUTO_CHAT_ERROR_EXIT_CODE[exitCode]}.`)
        process.exit(exitCode)
        return
      }
      console.log(`[Run core daemon] Child process exit with code ${exitCode}, an internal error may not be caught, and will be restarted in ${rerunInterval}ms.`)
      await sleep(rerunInterval)
      runWithDaemon()
    }
  )
}

runWithDaemon()