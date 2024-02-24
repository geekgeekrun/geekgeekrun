import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import type { InstalledBrowser } from '@puppeteer/browsers'
import { is } from '@electron-toolkit/utils'
import electron from 'electron'
import { saveLastUsedAndAvailableBrowserPath } from './history-utils'

const expectBuildId = process.env.EXPECT_CHROME_FOR_PUPPETEER_BUILD_ID || '121.0.6167.85'
const cacheDir = path.join(
  os.homedir(),
  '.geekgeekrun',
  'cache'
)

const getPuppeteerManagerModule = async () => {
  let puppeteerManager
  if (is.dev) {
    puppeteerManager = await import('@puppeteer/browsers')
  } else {
    puppeteerManager = (
      await import(
        path.resolve(
          electron.app.getAppPath(),
          '..',
          'external-node-runtime-dependencies/index.mjs'
        )
      )
    ).puppeteerManager
  }

  return puppeteerManager
}

export const getExpectCachedPuppeteerExecutablePath = async () => {
  const puppeteerManager = await getPuppeteerManagerModule()

  return puppeteerManager.computeExecutablePath({
    browser: puppeteerManager.Browser.CHROME,
    cacheDir,
    buildId: expectBuildId
  })
}

export const checkCachedPuppeteerExecutable = async () => {
  try {
    const executablePath = await getExpectCachedPuppeteerExecutablePath()
    return fs.existsSync(executablePath)
  } catch {
    // should limit [ERR_MODULE_NOT_FOUND]
    return false
  }
}

const checkAndDownloadPuppeteerExecutable = async (
  options: {
    downloadProgressCallback?: (downloadedBytes: number, totalBytes: number) => void
    confirmContinuePromise?: Promise<void>
  } = {}
) => {
  const puppeteerManager = await getPuppeteerManagerModule()
  let installedBrowser: InstalledBrowser
  if (!(await checkCachedPuppeteerExecutable())) {
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
  await saveLastUsedAndAvailableBrowserPath(await getExpectCachedPuppeteerExecutablePath())

  return installedBrowser
}

export default checkAndDownloadPuppeteerExecutable
