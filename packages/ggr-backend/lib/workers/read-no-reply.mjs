const WORKER_ID = 'readNoReplyAutoReminderMain'

export async function runReadNoReply({ runtime, taskReporter, shouldStop }) {
  if (!runtime || typeof runtime.runOnce !== 'function') throw new TypeError('runtime.runOnce is required')
  if (!taskReporter || typeof taskReporter.emit !== 'function') throw new TypeError('taskReporter.emit is required')
  if (typeof shouldStop !== 'function') throw new TypeError('shouldStop is required')
  try {
    while (!(await shouldStop())) await runtime.runOnce({ taskReporter })
    taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'completed' })
  } catch (error) {
    const stable = error instanceof Error ? error : new Error(String(error))
    stable.code ??= 'READ_NO_REPLY_FAILED'
    taskReporter.emit('task.progress', { workerId: WORKER_ID, state: 'failed', code: stable.code, message: stable.message })
    throw stable
  }
}
