import os from 'node:os'
import fs from 'node:fs'
import readline from 'node:readline'
import { createRuntimePaths } from '../../runtime-paths.mjs'
import { createRecordsService } from '../records-service.mjs'
import { createBrowserService } from '../browser-service.mjs'
import { createBackendBrowserRuntime } from './runtime.mjs'
import { createBrowserRecords } from './records.mjs'

function fd3Streams() {
  try {
    return {
      input: fs.createReadStream(null, { fd: 3, autoClose: false }),
      output: fs.createWriteStream(null, { fd: 3, autoClose: false })
    }
  } catch {
    return {}
  }
}

function write(output, data) {
  output?.write(`${JSON.stringify(data)}\n`)
}

/**
 * Node-only adapter for the old Electron child-process protocol. It contains
 * no browser logic: browser task ownership, persistence, and lifecycle remain
 * in the backend service.
 */
export function createBrowserCompatibilityBridge({ runtime, input, output }) {
  let bridge
  const browser = createBrowserService({
    runtime,
    emit(event, data) { bridge?.handleEvent(event, data) }
  })
  let bossTaskId = null
  let lineReader = null
  bridge = {
    handleEvent(event, data) {
      if (event !== 'task.progress') return
      if (data.state === 'cookie-collected') {
        void runtime.readSession().then((session) => {
          if (session?.cookies) write(output, { type: 'BOSS_ZHIPIN_COOKIE_COLLECTED', cookies: session.cookies })
        }).catch(() => {})
      }
      if (data.taskId === bossTaskId && data.state === 'page-opened') write(output, { type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY' })
      if (data.taskId === bossTaskId && data.state === 'browser-closed') write(output, { type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED' })
      if (data.state === 'failed') {
        const message = { code: data.code, message: data.message }
        write(output, data.taskId === bossTaskId
          ? { type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_FAILED', ...message }
          : { type: 'BOSS_ZHIPIN_LOGIN_PAGE_FAILED', ...message })
      }
    },
    startLogin() { return browser.openLogin() },
    startBoss() {
      if (input && !lineReader) {
        lineReader = readline.createInterface({ input, crlfDelay: Infinity })
        lineReader.on('line', (line) => {
          try {
            const message = JSON.parse(line)
            if (message?.type === 'NEW_WINDOW') void browser.openBossPage(message.url).catch(() => {})
          } catch {}
        })
      }
      const task = browser.openBoss()
      bossTaskId = task.taskId
      return task
    },
    async close() {
      lineReader?.close()
      await browser.close()
    }
  }
  return bridge
}

function createProcessBridge() {
  const runtimePaths = createRuntimePaths(os.homedir())
  const recordsService = createRecordsService({ databaseFile: runtimePaths.databaseFile })
  const records = createBrowserRecords({ getDataSource: recordsService.getDataSource })
  const runtime = createBackendBrowserRuntime({ runtimePaths, records, onIdle: () => recordsService.close() })
  const bridge = createBrowserCompatibilityBridge({ runtime, ...fd3Streams() })
  return { bridge, close: async () => Promise.allSettled([bridge.close(), recordsService.close()]) }
}

export const launchBossZhipinLoginPageWithPreloadExtension = () => {
  const { bridge } = createProcessBridge()
  return bridge.startLogin()
}

export const launchBossSite = () => {
  const { bridge } = createProcessBridge()
  return bridge.startBoss()
}
