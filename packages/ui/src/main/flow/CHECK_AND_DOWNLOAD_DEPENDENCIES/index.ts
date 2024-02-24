import { app } from 'electron'
import checkAndDownloadPuppeteerExecutable, {
  checkCachedPuppeteerExecutable,
  getExpectCachedPuppeteerExecutablePath
} from './check-and-download-puppeteer-executable'
import * as net from 'net'
import { pipeWriteRegardlessError } from '../utils/pipe'
import {
  removeLastUsedAndAvailableBrowserPath,
  getLastUsedAndAvailableBrowserPath,
  saveLastUsedAndAvailableBrowserPath
} from './history-utils'
import findAndLocateExistedChromiumExecutable from './check-and-locate-existed-chromium-executable'

export enum DOWNLOAD_ERROR_EXIT_CODE {
  NO_ERROR = 0,
  DOWNLOAD_ERROR = 1
}
export const getAnyAvailablePuppeteerExecutablePath = async (): Promise<string | null> => {
  const lastUsedOnePath = await getLastUsedAndAvailableBrowserPath()
  if (lastUsedOnePath) {
    return lastUsedOnePath
  }
  // find existed browser - the one maybe actively installed by user or ship with os like Edge on windows
  try {
    const existedOnePath = (await findAndLocateExistedChromiumExecutable()).path
    await saveLastUsedAndAvailableBrowserPath(existedOnePath)
    // save its path
    return existedOnePath
  } catch {
    console.log('no existed browser path found')
  }
  // find existed browser - the fallback one
  if (await checkCachedPuppeteerExecutable()) {
    return await getExpectCachedPuppeteerExecutablePath()
  }

  // if no one available, then return null and remove last used browser
  await removeLastUsedAndAvailableBrowserPath()
  return null
}

export const checkAndDownloadDependenciesForInit = async () => {
  process.on('disconnect', () => app.exit())
  app.dock.hide()
  let pipe: null | net.Socket = null
  try {
    pipe = new net.Socket({ fd: 3 })
  } catch {
    console.warn('pipe is not available')
  }

  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'NEED_RESETUP_DEPENDENCIES'
    }) + '\r\n'
  )

  try {
    let timeoutTimer = 0
    await new Promise((resolve, reject) => {
      checkAndDownloadPuppeteerExecutable({
        downloadProgressCallback(downloadedBytes: number, totalBytes: number) {
          clearTimeout(timeoutTimer)
          if (downloadedBytes !== totalBytes) {
            timeoutTimer = setTimeout(() => {
              // will encounter this when network disconnected when downloading
              reject(new Error('PROGRESS_NOT_CHANGED_TOO_LONG'))
            }, 30 * 1000)
          }
          console.log(downloadedBytes / totalBytes)
          pipeWriteRegardlessError(
            pipe,
            JSON.stringify({
              type: 'PUPPETEER_DOWNLOAD_PROGRESS',
              totalBytes,
              downloadedBytes
            })
          ) + '\r\n'
        }
      }).then(
        () => {
          resolve(void 0)
        },
        (err) => {
          reject(err)
        }
      )
    })
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.NO_ERROR)
  } catch (err) {
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.DOWNLOAD_ERROR)
  }
}
