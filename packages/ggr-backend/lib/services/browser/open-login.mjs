export async function openLogin({ runtime, taskReporter, taskId }) {
  if (!runtime || typeof runtime.openLogin !== 'function') throw Object.assign(new Error('Browser login runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  let browser
  try {
    return await runtime.openLogin({ taskId, taskReporter, onBrowserOpened: (value) => { browser = value } })
  } catch (error) {
    try { await browser?.close?.() } catch {}
    throw error
  }
}
