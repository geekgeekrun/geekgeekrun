export async function openBoss({ runtime, taskReporter, taskId, onBrowserOpened, signal }) {
  if (!runtime || typeof runtime.openBoss !== 'function') throw Object.assign(new Error('Boss browser runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  let browser
  try {
    return await runtime.openBoss({ taskId, taskReporter, signal, onBrowserOpened: (value) => { browser = value; onBrowserOpened?.(value) } })
  } catch (error) {
    if (!signal?.aborted) try { await browser?.close?.() } catch {}
    throw error
  }
}
