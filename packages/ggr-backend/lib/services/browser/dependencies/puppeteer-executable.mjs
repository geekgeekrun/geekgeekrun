export function createPuppeteerDependencies({ browserManager, cacheDir, buildId, browser, downloadBaseUrl }) {
  if (!browserManager) throw new TypeError('browserManager is required')
  const expectedPath = () => browserManager.computeExecutablePath({ browser, cacheDir, buildId })
  async function ensure({ onProgress, confirm = async () => {} } = {}) {
    const installed = await browserManager.getInstalledBrowsers({ cacheDir })
    const match = installed.find((item) => item.browser === browser && item.buildId === buildId)
    if (match) return { browser: match.browser, executablePath: match.executablePath }
    await confirm()
    const result = await browserManager.install({
      browser, cacheDir, buildId, downloadProgressCallback: onProgress,
      ...(downloadBaseUrl ? { baseUrl: downloadBaseUrl } : {})
    })
    return { browser: result.browser, executablePath: result.executablePath }
  }
  return { ensure, expectedPath }
}
