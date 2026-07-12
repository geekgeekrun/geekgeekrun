import { randomUUID } from 'node:crypto'
import { openBoss as runOpenBoss } from './browser/open-boss.mjs'
import { openLogin as runOpenLogin } from './browser/open-login.mjs'

export function createBrowserService({ runtime, emit = () => {}, createTaskId = randomUUID } = {}) {
  const tasks = new Map()
  const start = (kind, operation) => {
    const taskId = createTaskId()
    tasks.set(taskId, { taskId, state: 'starting', kind })
    const taskReporter = { emit: (event, data) => emit(event, { taskId, ...data }) }
    queueMicrotask(async () => {
      try {
        tasks.set(taskId, { taskId, state: 'running', kind })
        emit('task.progress', { taskId, kind, state: 'running' })
        await operation({ runtime, taskReporter, taskId })
        tasks.set(taskId, { taskId, state: 'completed', kind })
        emit('task.progress', { taskId, kind, state: 'completed' })
      } catch (error) {
        tasks.set(taskId, { taskId, state: 'failed', kind })
        emit('task.progress', { taskId, kind, state: 'failed', code: error?.code ?? 'BROWSER_TASK_FAILED', message: error?.message ?? String(error) })
      }
    })
    return { taskId, state: 'starting' }
  }
  return {
    openLogin: () => start('openLogin', runOpenLogin),
    openBoss: () => start('openBoss', runOpenBoss),
    getTask: (taskId) => tasks.get(taskId) ?? null,
    async close() { await runtime?.close?.() }
  }
}
