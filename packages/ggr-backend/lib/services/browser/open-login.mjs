export async function openLogin({ runtime, taskReporter, taskId, onBrowserOpened, signal }) {
  if (!runtime || typeof runtime.openLogin !== 'function') throw Object.assign(new Error('Browser login runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  let browser
  try {
    return await runtime.openLogin({ taskId, taskReporter, signal, onBrowserOpened: (value) => { browser = value; onBrowserOpened?.(value) } })
  } catch (error) {
    if (!signal?.aborted) try { await browser?.close?.() } catch {}
    throw error
  }
}
