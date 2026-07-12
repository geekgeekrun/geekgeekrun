const ALLOWED_EVENTS = new Set(['task.progress', 'approval.required'])

function assertEvent(event, data) {
  if (!ALLOWED_EVENTS.has(event)) throw Object.assign(new Error(`Worker event is not allowed: ${event}`), { code: 'INVALID_WORKER_EVENT' })
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('Worker event data must be an object'), { code: 'INVALID_WORKER_EVENT' })
}

export function createWorkerReporter({ write = (line) => process.stdout.write(line) } = {}) {
  if (typeof write !== 'function') throw new TypeError('write must be a function')
  return {
    emit(event, data) {
      assertEvent(event, data)
      write(`${JSON.stringify({ ggrWorkerEvent: 1, event, data })}\n`)
    }
  }
}
