import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as fsPromise from 'fs/promises'

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const lastUsedBrowserRecordFilePath = path.join(
  runtimeFolderPath,
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
export const getLastUsedAndAvailableBrowserPath = async (): Promise<string | null> => {
  if (!fs.existsSync(lastUsedBrowserRecordFilePath)) {
    return null
  }
  try {
    const fileContent = (await fsPromise.readFile(lastUsedBrowserRecordFilePath)).toString()
    if (!fileContent || !fs.existsSync(fileContent)) {
      await removeLastUsedAndAvailableBrowserPath()
      return null
    }
    return fileContent
  } catch {
    await removeLastUsedAndAvailableBrowserPath()
    return null
  }
}

export const saveLastUsedAndAvailableBrowserPath = async (pathToBrowser: string) => {
  try {
    if (!fs.existsSync(runtimeFolderPath)) {
      await fsPromise.mkdir(runtimeFolderPath)
    }
    await fsPromise.writeFile(lastUsedBrowserRecordFilePath, pathToBrowser)
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
