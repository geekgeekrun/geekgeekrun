export function createPuppeteerDependencies({ browserManager, cacheDir, buildId, browser }) {
  if (!browserManager) throw new TypeError('browserManager is required')
  const expectedPath = () => browserManager.computeExecutablePath({ browser, cacheDir, buildId })
  async function ensure({ onProgress, confirm = async () => {} } = {}) {
    await confirm()
    const installed = await browserManager.getInstalledBrowsers({ cacheDir })
    const match = installed.find((item) => item.browser === browser && item.buildId === buildId)
    if (match) return { browser: match.browser, executablePath: match.executablePath }
    const result = await browserManager.install({ browser, cacheDir, buildId, downloadProgressCallback: onProgress })
    return { browser: result.browser, executablePath: result.executablePath }
  }
  return { ensure, expectedPath }
}
