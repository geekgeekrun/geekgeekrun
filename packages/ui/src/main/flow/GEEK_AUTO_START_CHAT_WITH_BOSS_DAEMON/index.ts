import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import childProcess from 'node:child_process'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import { app } from 'electron'
import fs, { WriteStream } from 'node:fs'
import { pipeWriteRegardlessError } from '../utils/pipe'
import * as JSONStream from 'JSONStream'
import { initPowerSaveBlocker } from './power-saver-blocker'
import gtag from '../../utils/gtag'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()
function runWithDaemon() {
  const subProcessOfCore = childProcess.spawn(process.argv[0], process.argv.slice(1), {
    stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc'],
    env: {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'geekAutoStartWithBossMain'
    }
  })

  subProcessOfCore!.stdio[3]!.pipe(JSONStream.parse()).on('data', async (raw) => {
    const data = raw
    switch (data.type) {
      case 'AUTO_START_CHAT_MAIN_PROCESS_STARTUP': {
        pipeWriteRegardlessError(
          subProcessOfCore!.stdio[3]! as WriteStream,
          JSON.stringify({
            type: 'GEEK_AUTO_START_CHAT_CAN_BE_RUN'
          })
        )
        break
      }
      default: {
        return
      }
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

// suicide timer for parent and child process don't have any communication after child process spawned.
let suicideTimer: NodeJS.Timeout | null = null
const setSuicideTimer = () =>
  (suicideTimer = setTimeout(() => {
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.AUTO_START_CHAT_DAEMON_PROCESS_SUICIDE)
  }, 10000))
const clearSuicideTimer = () => {
  if (suicideTimer) {
    clearTimeout(suicideTimer)
  }
  suicideTimer = null
}

export function runAutoChatWithDaemon() {
  app.dock?.hide()
  process.on('disconnect', () => {
    app.exit()
  })
  setSuicideTimer()

  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.error('pipe is not available')
    app.exit(1)
  }

  const disposePowerSaveBlocker = initPowerSaveBlocker()
  app.once('quit', disposePowerSaveBlocker)

  const pipeForRead: fs.ReadStream = fs.createReadStream(null, { fd: 3 })
  const pipeForReadWithJsonParser = pipeForRead.pipe(JSONStream.parse())
  pipeForReadWithJsonParser?.on('data', function waitForCanRun(data) {
    if (data.type === 'GEEK_AUTO_START_CHAT_CAN_BE_RUN') {
      pipeForReadWithJsonParser.off('data', waitForCanRun)
      clearSuicideTimer()
      runWithDaemon()

      // if don't call close, when kill child process, child process will ANR.
      pipeForRead.close()
    }
  })
  process.on('SIGINT', () => {
    process.exit()
  })

  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'AUTO_START_CHAT_DAEMON_PROCESS_STARTUP'
    })
  )

  gtag('run_auto_chat_with_boss_daemon_ready')
}
