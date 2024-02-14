import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import type { InstalledBrowser } from '@puppeteer/browsers'

const expectBuildId = process.env.EXPECT_CHROME_FOR_PUPPETEER_BUILD_ID || '121.0.6167.85'
const cacheDir = path.join(
  os.homedir(),
  '.bossgeekgo',
  'external-node-runtime-dependencies',
  'static'
)

const checkAndDownloadPuppeteer = async (options: {
  downloadProgressCallback?: (downloadedBytes: number, totalBytes: number) => void
}) => {
  const puppeteerManager = await import('@puppeteer/browsers')
  const executablePath = puppeteerManager.computeExecutablePath({
    browser: puppeteerManager.Browser.CHROME,
    cacheDir,
    buildId: expectBuildId
  })
  let installedBrowser: InstalledBrowser
  if (!fs.existsSync(executablePath)) {
    // maybe the exist installation is broken.
    await puppeteerManager.uninstall({
      cacheDir,
      buildId: expectBuildId,
      browser: puppeteerManager.Browser.CHROME,
    })
    installedBrowser = await puppeteerManager.install({
      browser: puppeteerManager.Browser.CHROME,
      cacheDir,
      buildId: expectBuildId,
      downloadProgressCallback: options.downloadProgressCallback
    })
  } else {
    installedBrowser = (
      await puppeteerManager.getInstalledBrowsers({
        cacheDir
      })
    ).find((it) => it.buildId === expectBuildId)!
  }

  return installedBrowser
}

export default checkAndDownloadPuppeteer