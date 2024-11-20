import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import childProcess from 'node:child_process'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import { app, dialog } from 'electron'
import fs, { WriteStream } from 'node:fs'
import { pipeWriteRegardlessError } from '../utils/pipe'
import * as JSONStream from 'JSONStream'
import { initPowerSaveBlocker } from './power-saver-blocker'
import gtag from '../../utils/gtag'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { AutoStartChatRunRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/AutoStartChatRunRecord'
import minimist from 'minimist'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()
function runWithDaemon({ runRecordId, runMode, parentProcessPipe }) {
  const subProcessOfCore = childProcess.spawn(
    process.argv[0],
    [...process.argv.slice(1), `--run-record-id=${runRecordId}`],
    {
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc'],
      env: {
        ...process.env,
        MAIN_BOSSGEEKGO_UI_RUN_MODE: runMode
      }
    }
  )

  subProcessOfCore!.stdio[3]!.pipe(JSONStream.parse()).on('data', async (raw) => {
    const data = raw
    switch (data.type) {
      case 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED': {
        pipeWriteRegardlessError(
          parentProcessPipe as WriteStream,
          JSON.stringify({
            type: data.type
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
    runWithDaemon({ runRecordId, runMode, parentProcessPipe })
  })
}

export async function runAutoChatWithDaemon() {
  const commandlineArgs = minimist(process.argv.slice(2))
  if (!['geekAutoStartWithBossMain'].includes(commandlineArgs['mode-to-daemon'])) {
    await new Promise((resolve) => {
      app.once('ready', () => resolve(undefined))
    })

    dialog.showMessageBoxSync({
      type: 'error',
      message: `守护进程不支持 ${commandlineArgs['mode-to-daemon'] ?? '（默认）'} 模式`
    })
    app.exit()
    return
  }

  app.dock?.hide()
  process.on('disconnect', () => {
    app.exit()
  })

  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.error('pipe is not available')
    app.exit(1)
  }

  const disposePowerSaveBlocker = initPowerSaveBlocker()
  app.once('quit', disposePowerSaveBlocker)

  process.on('SIGINT', () => {
    process.exit()
  })

  const ds = await initDb(getPublicDbFilePath())
  const autoStartChatRunRecord = new AutoStartChatRunRecord()
  autoStartChatRunRecord.date = new Date()
  const autoStartChatRunRecordRepository = ds.getRepository(AutoStartChatRunRecord)
  const result = await autoStartChatRunRecordRepository.save(autoStartChatRunRecord)
  runWithDaemon({
    runRecordId: result.id,
    runMode: commandlineArgs['mode-to-daemon'],
    parentProcessPipe: pipe
  })

  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'AUTO_START_CHAT_DAEMON_PROCESS_STARTUP'
    })
  )

  gtag('daemon_ready', { mode: commandlineArgs['mode-to-daemon'] ?? '' })
}

attachListenerForKillSelfOnParentExited()
