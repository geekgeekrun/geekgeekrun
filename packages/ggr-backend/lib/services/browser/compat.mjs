import os from 'node:os'
import fs from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
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

function readFd3Messages(input, onMessage) {
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  const dispatch = (raw) => {
    try { onMessage(JSON.parse(raw)) } catch {}
  }
  const consume = () => {
    while (buffer) {
      const newline = buffer.indexOf('\n')
      if (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) dispatch(line)
        continue
      }
      const raw = buffer.trim()
      if (!raw) { buffer = ''; return }
      try {
        const message = JSON.parse(raw)
        buffer = ''
        onMessage(message)
      } catch {
        // A legacy caller writes one bare JSON value without a delimiter. Keep
        // incomplete chunks until JSON.parse can prove the complete value.
        return
      }
    }
  }
  const onData = (chunk) => { buffer += decoder.write(chunk); consume() }
  const onEnd = () => { buffer += decoder.end(); consume() }
  input.on('data', onData)
  input.on('end', onEnd)
  return () => {
    input.off?.('data', onData)
    input.off?.('end', onEnd)
  }
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
  let stopReading = null
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
    openBossPage(url) { return browser.openBossPage(url) },
    startBoss() {
      if (input && !stopReading) {
        stopReading = readFd3Messages(input, (message) => {
          if (message?.type === 'NEW_WINDOW') void browser.openBossPage(message.url).catch(() => {})
        })
      }
      const task = browser.openBoss()
      bossTaskId = task.taskId
      return task
    },
    async close() {
      stopReading?.()
      stopReading = null
      await browser.close()
    }
  }
  return bridge
}

function createProcessBridge(streams = {}) {
  const runtimePaths = createRuntimePaths(os.homedir())
  const recordsService = createRecordsService({ databaseFile: runtimePaths.databaseFile })
  const records = createBrowserRecords({ getDataSource: recordsService.getDataSource })
  const runtime = createBackendBrowserRuntime({ runtimePaths, records, onIdle: () => recordsService.close() })
  const bridge = createBrowserCompatibilityBridge({ runtime, ...(Object.keys(streams).length ? streams : fd3Streams()) })
  return { bridge, close: async () => Promise.allSettled([bridge.close(), recordsService.close()]) }
}

/** UI-facing compatibility API. The UI only observes legacy events; backend owns browser state. */
export function createBrowserCompatibilityApi({ onMessage = () => {} } = {}) {
  const output = {
    write(raw) {
      for (const line of String(raw).split('\n')) {
        if (!line) continue
        try { onMessage(JSON.parse(line)) } catch {}
      }
    }
  }
  const { bridge, close } = createProcessBridge({ output })
  return {
    startLogin: () => bridge.startLogin(),
    startBoss: () => bridge.startBoss(),
    openBossPage: (url) => bridge.openBossPage(url),
    close
  }
}

export const launchBossZhipinLoginPageWithPreloadExtension = () => {
  const { bridge } = createProcessBridge()
  return bridge.startLogin()
}

export const launchBossSite = () => {
  const { bridge } = createProcessBridge()
  return bridge.startBoss()
}
