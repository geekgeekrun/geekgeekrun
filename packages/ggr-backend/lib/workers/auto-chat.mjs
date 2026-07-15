import { fileURLToPath } from 'node:url'
import { createWorkerReporter } from './worker-reporter.mjs'

const WORKER_ID = 'geekAutoStartWithBossMain'

function reporter(value) {
  if (!value || typeof value.emit !== 'function') throw new TypeError('taskReporter.emit is required')
  return value
}

export async function runAutoChat({ runtime, taskReporter, shouldStop }) {
  if (!runtime || typeof runtime.runOnce !== 'function') throw new TypeError('runtime.runOnce is required')
  if (typeof shouldStop !== 'function') throw new TypeError('shouldStop is required')
  const reports = reporter(taskReporter)
  try {
    while (!(await shouldStop())) await runtime.runOnce({ taskReporter: reports })
    reports.emit('task.progress', { workerId: WORKER_ID, state: 'completed' })
  } catch (error) {
    const stable = error instanceof Error ? error : new Error(String(error))
    stable.code ??= 'AUTO_CHAT_FAILED'
    reports.emit('task.progress', { workerId: WORKER_ID, state: 'failed', code: stable.code, message: stable.message })
    throw stable
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })
  const { createAutoChatRuntime } = await import('./auto-chat-runtime.mjs')
  await runAutoChat({
    runtime: await createAutoChatRuntime(),
    taskReporter: createWorkerReporter(),
    shouldStop: async () => stopping
  })
}
