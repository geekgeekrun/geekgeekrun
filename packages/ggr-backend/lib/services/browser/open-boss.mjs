export async function openBoss({ runtime, taskReporter, taskId }) {
  if (!runtime || typeof runtime.openBoss !== 'function') throw Object.assign(new Error('Boss browser runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  let browser
  try {
    return await runtime.openBoss({ taskId, taskReporter, onBrowserOpened: (value) => { browser = value } })
  } catch (error) {
    try { await browser?.close?.() } catch {}
    throw error
  }
}
