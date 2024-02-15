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

const getPuppeteerManagerModule = async () => {
  const runtimeDependencies = await import(
    path.join(os.homedir(), '.bossgeekgo', 'external-node-runtime-dependencies/index.mjs')
  )
  return runtimeDependencies.puppeteerManager
}

export const getExpectPuppeteerExecutablePath = async () => {
  const puppeteerManager = await getPuppeteerManagerModule()

  return puppeteerManager.computeExecutablePath({
    browser: puppeteerManager.Browser.CHROME,
    cacheDir,
    buildId: expectBuildId
  })
}

export const checkPuppeteerExecutable = async () => {
  const executablePath = await getExpectPuppeteerExecutablePath()
  return fs.existsSync(executablePath)
}

const checkAndDownloadPuppeteer = async (options: {
  downloadProgressCallback?: (downloadedBytes: number, totalBytes: number) => void,
  confirmContinuePromise?: Promise<void>
} = {}) => {
  const puppeteerManager = await getPuppeteerManagerModule()
  let installedBrowser: InstalledBrowser
  if (!(await checkPuppeteerExecutable())) {
    try {
      await options.confirmContinuePromise
    } catch {
      throw new Error('USER_CANCEL_DOWNLOAD_PUPPETEER')
    }
    // maybe the exist installation is broken.
    await puppeteerManager.uninstall({
      cacheDir,
      buildId: expectBuildId,
      browser: puppeteerManager.Browser.CHROME
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
