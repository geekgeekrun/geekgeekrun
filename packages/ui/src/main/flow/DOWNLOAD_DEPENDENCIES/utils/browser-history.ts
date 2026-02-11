import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as fsPromise from 'fs/promises'

export interface BrowserInfo {
  browser: string
  executablePath: string
}

const CONFIG_VERSION = 2

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const lastUsedBrowserRecordFilePath = path.join(
  runtimeFolderPath,
  'storage',
  'last-used-browser-record'
)
/**
 * check if last used browser is still available.
 *
 * look if last used one is exist, maybe it's downloaded by puppeteer
 * immediately return its path
 * else remove its history
 * @returns
 */
export const getLastUsedAndAvailableBrowser = async (): Promise<BrowserInfo | null> => {
  if (!fs.existsSync(lastUsedBrowserRecordFilePath)) {
    return null
  }
  try {
    const fileContent = (await fsPromise.readFile(lastUsedBrowserRecordFilePath)).toString()
    const [path, browser, configVersion] = fileContent.split('\n').map((it) => it.trim())
    if (
      !path ||
      !fs.existsSync(path) ||
      !Number(configVersion) ||
      Number(configVersion) < CONFIG_VERSION
    ) {
      await removeLastUsedAndAvailableBrowserPath()
      return null
    }
    return {
      executablePath: path,
      browser
    }
  } catch {
    await removeLastUsedAndAvailableBrowserPath()
    return null
  }
}

export const saveLastUsedAndAvailableBrowserInfo = async (browserInfo: BrowserInfo) => {
  try {
    if (!fs.existsSync(runtimeFolderPath)) {
      await fsPromise.mkdir(runtimeFolderPath)
    }
    await fsPromise.writeFile(
      lastUsedBrowserRecordFilePath,
      [browserInfo.executablePath, browserInfo.browser, CONFIG_VERSION].join('\n')
    )
  } catch {
    console.warn('lastUsedBrowserRecordFile write error')
  }
}

export const removeLastUsedAndAvailableBrowserPath = async () => {
  if (!fs.existsSync(lastUsedBrowserRecordFilePath)) {
    return
  }
  await fsPromise.unlink(lastUsedBrowserRecordFilePath)
}
