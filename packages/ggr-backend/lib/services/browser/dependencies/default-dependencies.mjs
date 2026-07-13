import path from 'node:path'
import { createBrowserHistory } from './browser-history.mjs'
import { createPuppeteerDependencies } from './puppeteer-executable.mjs'

export const EXPECTED_CHROME_BUILD_ID = '139.0.7258.154'
export const CHROME_DOWNLOAD_BASE_URL = 'https://registry.npmmirror.com/-/binary/chrome-for-testing'

export async function createDefaultBrowserDependencies({ runtimePaths }) {
  const browserManager = await import('@puppeteer/browsers')
  const browser = browserManager.Browser.CHROME
  const cacheDir = path.join(runtimePaths.rootDir, 'cache')
  const history = createBrowserHistory({ storageDir: runtimePaths.storageDir })
  const dependency = createPuppeteerDependencies({
    browserManager, cacheDir, buildId: EXPECTED_CHROME_BUILD_ID, browser,
    downloadBaseUrl: CHROME_DOWNLOAD_BASE_URL
  })

  async function normalized(value) {
    return value && { executablePath: value.executablePath, browser: value.browser ?? `Chrome ${EXPECTED_CHROME_BUILD_ID}` }
  }
  async function cached() {
    const executablePath = dependency.expectedPath()
    return browserManager.getInstalledBrowsers({ cacheDir }).then((items) =>
      items.some((item) => item.browser === browser && item.buildId === EXPECTED_CHROME_BUILD_ID) ? { executablePath, browser: `Chrome ${EXPECTED_CHROME_BUILD_ID}` } : null)
  }
  async function discover({ ignoreCached = false, noSave = false } = {}) {
    let result = ignoreCached ? null : await history.read()
    result ??= await cached()
    if (!result) {
      try {
        const { findChrome } = await import('find-chrome-bin')
        result = await normalized(await findChrome({ min: Number(EXPECTED_CHROME_BUILD_ID.split('.')[0]) + 1 }))
      } catch {}
    }
    if (result && !noSave) await history.write(result)
    if (!result) await history.remove()
    return result
  }
  async function ensure({ downloadProgressCallback, confirmContinuePromise } = {}) {
    const result = await dependency.ensure({
      onProgress: downloadProgressCallback,
      confirm: async () => { if (confirmContinuePromise) await confirmContinuePromise }
    })
    const value = await normalized(result)
    await history.write(value)
    return value
  }
  return { discover, ensure, expected: cached, history }
}
