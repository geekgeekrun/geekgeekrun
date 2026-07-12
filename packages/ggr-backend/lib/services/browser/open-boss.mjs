export async function openBoss({ runtime, taskReporter, taskId }) {
  if (!runtime || typeof runtime.openBoss !== 'function') throw Object.assign(new Error('Boss browser runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  return runtime.openBoss({ taskId, taskReporter })
}
