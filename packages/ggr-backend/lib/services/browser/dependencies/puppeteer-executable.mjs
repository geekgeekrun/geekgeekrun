export function createPuppeteerDependencies({ browserManager, cacheDir, buildId, browser, downloadBaseUrl }) {
  if (!browserManager) throw new TypeError('browserManager is required')
  const expectedPath = () => browserManager.computeExecutablePath({ browser, cacheDir, buildId })
  const cancelled = () => Object.assign(new Error('Browser dependency installation was cancelled'), { code: 'TASK_CANCELLED' })
  const aborted = (signal) => {
    if (signal?.aborted) throw cancelled()
  }
  const awaitAbortable = (operation, signal) => {
    aborted(signal)
    if (!signal) return operation
    let onAbort
    const cancellation = new Promise((_, reject) => {
      onAbort = () => reject(cancelled())
      signal.addEventListener('abort', onAbort, { once: true })
    })
    return Promise.race([operation, cancellation]).finally(() => signal.removeEventListener('abort', onAbort))
  }
  const cleanupPartialInstall = async () => {
    await browserManager.uninstall?.({ browser, cacheDir, buildId })
  }
  async function ensure({ onProgress, confirm = async () => {}, signal } = {}) {
    aborted(signal)
    const installed = await browserManager.getInstalledBrowsers({ cacheDir })
    const match = installed.find((item) => item.browser === browser && item.buildId === buildId)
    if (match) return { browser: match.browser, executablePath: match.executablePath }
    await awaitAbortable(Promise.resolve(confirm()), signal)
    const installing = browserManager.install({
      browser, cacheDir, buildId, downloadProgressCallback: onProgress,
      ...(downloadBaseUrl ? { baseUrl: downloadBaseUrl } : {}),
      signal
    })
    try {
      const result = await awaitAbortable(installing, signal)
      return { browser: result.browser, executablePath: result.executablePath }
    } catch (error) {
      if (signal?.aborted) {
        await cleanupPartialInstall().catch(() => {})
        void installing.then(() => cleanupPartialInstall()).catch(() => {})
      }
      throw error
    }
  }
  return { ensure, expectedPath }
}
