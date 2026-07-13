import { randomUUID } from 'node:crypto'
import { openBoss as runOpenBoss } from './browser/open-boss.mjs'
import { openLogin as runOpenLogin } from './browser/open-login.mjs'

export function createBrowserService({ runtime, emit = () => {}, createTaskId = randomUUID } = {}) {
  const tasks = new Map()
  const resources = new Map()
  const start = (kind, operation, params = {}) => {
    const taskId = createTaskId()
    const task = { taskId, state: 'starting', kind }
    const resource = { browser: null, controller: new AbortController() }
    tasks.set(taskId, task)
    resources.set(taskId, resource)
    const taskReporter = { emit: (event, data) => emit(event, { taskId, ...data }) }
    queueMicrotask(async () => {
      try {
        task.state = 'running'
        emit('task.progress', { taskId, kind, state: 'running' })
        await operation({ runtime, taskReporter, taskId, signal: resource.controller.signal, onBrowserOpened: (browser) => { resource.browser = browser }, ...params })
        if (task.state === 'cancelled') return
        task.state = 'completed'
        emit('task.progress', { taskId, kind, state: 'completed' })
      } catch (error) {
        if (task.state === 'cancelled') return
        task.state = 'failed'
        emit('task.progress', { taskId, kind, state: 'failed', code: error?.code ?? 'BROWSER_TASK_FAILED', message: error?.message ?? String(error) })
      }
    })
    return { taskId, state: 'starting' }
  }
  return {
    openLogin: () => start('openLogin', runOpenLogin),
    openBoss: ({ url } = {}) => start('openBoss', runOpenBoss, { url }),
    async openBossPage(url) {
      if (typeof url !== 'string' || !url) throw Object.assign(new Error('A page URL is required'), { code: 'INVALID_PARAMS' })
      return runtime.openBossPage(url)
    },
    getTask: (taskId) => tasks.get(taskId) ?? null,
    async cancel(taskId) {
      const task = tasks.get(taskId)
      if (!task || ['completed', 'failed', 'cancelled'].includes(task.state)) return task ?? null
      const resource = resources.get(taskId)
      task.state = 'cancelled'
      resource?.controller.abort()
      await resource?.browser?.close?.()
      emit('task.progress', { taskId, kind: task.kind, state: 'cancelled' })
      return task
    },
    async close() {
      for (const [taskId, resource] of resources) {
        if (!['completed', 'failed', 'cancelled'].includes(tasks.get(taskId)?.state)) {
          tasks.get(taskId).state = 'cancelled'
          resource.controller.abort()
        }
      }
      const closed = await Promise.allSettled([...resources.values()].map((resource) => resource.browser?.close?.()))
      resources.clear()
      const runtimeClosed = await Promise.allSettled([runtime?.close?.()])
      const failures = [...closed, ...runtimeClosed].filter(({ status }) => status === 'rejected').map(({ reason }) => reason)
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures, 'Browser shutdown failed')
    }
  }
}
