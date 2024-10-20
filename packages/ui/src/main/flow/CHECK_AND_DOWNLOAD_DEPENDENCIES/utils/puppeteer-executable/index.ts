import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import type { InstalledBrowser } from '@puppeteer/browsers'
import {
  saveLastUsedAndAvailableBrowserInfo,
  BrowserInfo,
  getLastUsedAndAvailableBrowser,
  removeLastUsedAndAvailableBrowserPath
} from '../browser-history'
import { getExecutableFileVersion } from '@geekgeekrun/utils/windows-only/file.mjs'
import createCheckAndLocateExistedChromiumExecutableWorker from './worker/find-and-locate-existed-chromium-executable?nodeWorker&url'
import { type Worker, isMainThread } from 'node:worker_threads'
import gtag from '../../../../utils/gtag'

const getPuppeteerManagerModule = async () => {
  let puppeteerManager
  if (process.env.NODE_ENV === 'development') {
    puppeteerManager = await import('@puppeteer/browsers')
  } else if (isMainThread) {
    const electron = await import('electron')
    puppeteerManager = (
      await import(
        'file://' +
          path.resolve(
            electron.app.getAppPath(),
            '..',
            'external-node-runtime-dependencies/index.mjs'
          )
      )
    ).puppeteerManager
  } else {
    puppeteerManager = (
      await import(
        'file://' +
          path.join(__dirname, '../../..', '/external-node-runtime-dependencies/index.mjs')
      )
    ).puppeteerManager
  }

  return puppeteerManager
}

const EXPECT_CHROMIUM_BUILD_ID = '113.0.5672.63'
const cacheDir = path.join(os.homedir(), '.geekgeekrun', 'cache')

const getExpectCachedPuppeteerExecutable = async (): Promise<BrowserInfo> => {
  const puppeteerManager = await getPuppeteerManagerModule()

  const executablePath = puppeteerManager.computeExecutablePath({
    browser: puppeteerManager.Browser.CHROME,
    cacheDir,
    buildId: EXPECT_CHROMIUM_BUILD_ID
  })

  const browser =
    puppeteerManager.Browser.CHROME[0].toUpperCase() +
    puppeteerManager.Browser.CHROME.slice(1) +
    ' ' +
    EXPECT_CHROMIUM_BUILD_ID
  return {
    executablePath,
    browser
  }
}

const checkCachedPuppeteerExecutable = async () => {
  try {
    const executablePath = (await getExpectCachedPuppeteerExecutable()).executablePath
    return fs.existsSync(executablePath)
  } catch {
    // should limit [ERR_MODULE_NOT_FOUND]
    return false
  }
}

export const checkAndDownloadPuppeteerExecutable = async (
  options: {
    downloadProgressCallback?: (downloadedBytes: number, totalBytes: number) => void
    confirmContinuePromise?: Promise<void>
  } = {}
) => {
  const puppeteerManager = await getPuppeteerManagerModule()
  let installedBrowser: InstalledBrowser
  if (!(await checkCachedPuppeteerExecutable())) {
    gtag('need_download_browser')
    try {
      await options.confirmContinuePromise
    } catch {
      throw new Error('USER_CANCEL_DOWNLOAD_PUPPETEER')
    }
    // maybe the exist installation is broken.
    await puppeteerManager.uninstall({
      cacheDir,
      buildId: EXPECT_CHROMIUM_BUILD_ID,
      browser: puppeteerManager.Browser.CHROME
    })
    installedBrowser = await puppeteerManager.install({
      browser: puppeteerManager.Browser.CHROME,
      cacheDir,
      buildId: EXPECT_CHROMIUM_BUILD_ID,
      downloadProgressCallback: options.downloadProgressCallback
    })
  } else {
    gtag('use_installed_browser')
    installedBrowser = (
      await puppeteerManager.getInstalledBrowsers({
        cacheDir
      })
    ).find((it) => it.buildId === EXPECT_CHROMIUM_BUILD_ID)!
  }
  await saveLastUsedAndAvailableBrowserInfo({
    executablePath: installedBrowser.executablePath,
    browser:
      installedBrowser.browser[0].toUpperCase() +
      installedBrowser.browser.slice(1) +
      ' ' +
      EXPECT_CHROMIUM_BUILD_ID
  })

  return installedBrowser
}

export const getAnyAvailablePuppeteerExecutable = async (): Promise<BrowserInfo | null> => {
  const lastUsedOne = await getLastUsedAndAvailableBrowser()
  if (lastUsedOne) {
    return lastUsedOne
  }
  // find existed browser - the one maybe actively installed by user or ship with os like Edge on windows
  try {
    const existedOne = await findAndLocateUserInstalledChromiumExecutable()
    await saveLastUsedAndAvailableBrowserInfo(existedOne)
    // save its path
    return existedOne
  } catch (err) {
    console.error(err)
    console.log('no existed browser path found')
  }
  // find existed browser - the fallback one
  if (await checkCachedPuppeteerExecutable()) {
    const cachedOne = await getExpectCachedPuppeteerExecutable()
    await saveLastUsedAndAvailableBrowserInfo(cachedOne)

    return cachedOne
  }

  // if no one available, then return null and remove last used browser
  await removeLastUsedAndAvailableBrowserPath()
  return null
}

export async function findAndLocateUserInstalledChromiumExecutableSync(): Promise<BrowserInfo> {
  const exceptChromiumMainVersion = Number(EXPECT_CHROMIUM_BUILD_ID.split('.')[0])
  // For windows, try to find Edge(chromium)
  if (os.platform() === 'win32') {
    // TODO: handle windows
    const edgeExecutableLocation = path.join(
      process.env['ProgramFiles(x86)']!,
      'Microsoft/Edge/Application',
      'msedge.exe'
    )
    if (fs.existsSync(edgeExecutableLocation)) {
      try {
        const version = await getExecutableFileVersion(edgeExecutableLocation)
        const mainVersion = Number(version.split('.')[0])
        if (mainVersion >= exceptChromiumMainVersion) {
          return {
            executablePath: edgeExecutableLocation,
            browser: `Edge ${version}`
          }
        }
      } catch (err) {
        console.log(err)
      }
    }
  }

  // For other, use findChrome
  let findChrome: typeof import('find-chrome-bin').findChrome
  if (process.env.NODE_ENV === 'development') {
    findChrome = (await import('find-chrome-bin')).findChrome
  } else if (isMainThread) {
    const electron = await import('electron')
    findChrome = (
      await import(
        'file://' +
          path.resolve(
            electron.app.getAppPath(),
            '..',
            'external-node-runtime-dependencies/index.mjs'
          )
      )
    ).findChromeBin.findChrome
  } else {
    findChrome = (
      await import(
        'file://' +
          path.join(__dirname, '../../..', '/external-node-runtime-dependencies/index.mjs')
      )
    ).findChromeBin.findChrome
  }
  const targetBrowser = await findChrome({
    min: exceptChromiumMainVersion
  })
  if (!targetBrowser?.executablePath) {
    throw new Error('NO_EXPECT_CHROMIUM_FOUND')
  }
  return {
    executablePath: targetBrowser.executablePath,
    browser: targetBrowser.browser
  }
}

export async function findAndLocateUserInstalledChromiumExecutable(): Promise<BrowserInfo> {
  return new Promise((resolve, reject) => {
    const worker: Worker = createCheckAndLocateExistedChromiumExecutableWorker({
      env: {
        ...process.env,
        RESOURCES_PATH: process.resourcesPath
      }
    })
    worker.once('message', (data) => {
      if (data.type === 'RESULT') {
        resolve(data.data)
      }
    })
    worker.once('message', (data) => {
      if (data.type === 'ERROR') {
        reject(data.error)
      }
    })
  })
}
