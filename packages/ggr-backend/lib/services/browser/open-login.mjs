export async function openLogin({ runtime, taskReporter, taskId }) {
  if (!runtime || typeof runtime.openLogin !== 'function') throw Object.assign(new Error('Browser login runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  return runtime.openLogin({ taskId, taskReporter })
}
