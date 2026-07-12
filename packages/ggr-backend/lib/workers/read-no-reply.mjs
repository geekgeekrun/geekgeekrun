import { fileURLToPath } from 'node:url'
import { createWorkerReporter } from './worker-reporter.mjs'

const WORKER_ID = 'readNoReplyAutoReminderMain'
const KNOWN_CODES = ['COOKIE_INVALID', 'LOGIN_STATUS_INVALID', 'ERR_INTERNET_DISCONNECTED', 'ACCESS_IS_DENIED', 'PUPPETEER_IS_NOT_EXECUTABLE', 'LLM_UNAVAILABLE']
const EXIT_CODES = Object.freeze({ COOKIE_INVALID: 81, LOGIN_STATUS_INVALID: 82, ERR_INTERNET_DISCONNECTED: 83, ACCESS_IS_DENIED: 84, PUPPETEER_IS_NOT_EXECUTABLE: 85, LLM_UNAVAILABLE: 86 })

export function workerExitCode(error) { return EXIT_CODES[error?.code] ?? 1 }

function stableError(value) {
  const error = value instanceof Error ? value : new Error(String(value))
  error.code ??= KNOWN_CODES.find((code) => error.message.includes(code)) ?? 'READ_NO_REPLY_FAILED'
  return error
}

export async function runReadNoReply({ runtime, taskReporter, shouldStop }) {
  if (!runtime || typeof runtime.runOnce !== 'function') throw new TypeError('runtime.runOnce is required')
  if (!taskReporter || typeof taskReporter.emit !== 'function') throw new TypeError('taskReporter.emit is required')
  if (typeof shouldStop !== 'function') throw new TypeError('shouldStop is required')
  try {
    while (!(await shouldStop())) await runtime.runOnce({ taskReporter, shouldStop })
    taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'stopping' })
    taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'completed' })
  } catch (error) {
    const stable = stableError(error)
    taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'failed', code: stable.code, message: stable.message })
    stable.readNoReplyFailureReported = true
    throw stable
  } finally {
    await runtime.close?.()
  }
}

export async function runReadNoReplyEntry({ createRuntime, taskReporter = createWorkerReporter(), shouldStop } = {}) {
  if (typeof createRuntime !== 'function') throw new TypeError('createRuntime is required')
  taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'starting' })
  try {
    const runtime = await createRuntime({ taskReporter })
    await runReadNoReply({ runtime, taskReporter, shouldStop: shouldStop ?? runtime.shouldStop ?? (() => false) })
    return 0
  } catch (error) {
    const stable = stableError(error)
    if (!stable.readNoReplyFailureReported) taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'failed', code: stable.code, message: stable.message })
    throw stable
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })
  try {
    const { createReadNoReplyRuntime } = await import('./read-no-reply/runtime.mjs')
    await runReadNoReplyEntry({ createRuntime: createReadNoReplyRuntime, shouldStop: async () => stopping })
  } catch (error) {
    console.error(error)
    process.exitCode = workerExitCode(error)
  }
}
