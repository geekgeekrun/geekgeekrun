import { app } from 'electron'
import checkAndDownloadPuppeteerExecutable, {
  checkCachedPuppeteerExecutable,
  getExpectCachedPuppeteerExecutablePath
} from './check-and-download-puppeteer-executable'
import * as fs from 'fs'
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
  app.dock?.hide()
  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
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
    const promiseWithResolver = (() => {
      const o = {} as unknown as {
        promise: Promise<unknown>
        resolve: (result: unknown) => void
        reject: (reason: unknown) => void
      }
      o.promise = new Promise((resolve, reject) => {
        o.resolve = resolve
        o.reject = reject
      })
      return o
    })()

    let throttleProgressTimer: number | null = null
    checkAndDownloadPuppeteerExecutable({
      downloadProgressCallback(downloadedBytes: number, totalBytes: number) {
        clearTimeout(timeoutTimer)
        if (downloadedBytes !== totalBytes) {
          timeoutTimer = setTimeout(() => {
            // will encounter this when network disconnected when downloading
            promiseWithResolver.reject(new Error('PROGRESS_NOT_CHANGED_TOO_LONG'))
          }, 5 * 1000)
        } else {
          clearTimeout(throttleProgressTimer)
          throttleProgressTimer = null
        }

        if (!throttleProgressTimer) {
          // console.log(JSON.stringify({
          //   type: 'DOWNLOAD_PROGRESS_UPDATE',
          //   level: 'DEBUG',
          //   percent: downloadedBytes / totalBytes
          // }))

          pipeWriteRegardlessError(
            pipe,
            JSON.stringify({
              type: 'PUPPETEER_DOWNLOAD_PROGRESS',
              totalBytes,
              downloadedBytes
            }) + '\r\n'
          )
          throttleProgressTimer = setTimeout(() => {
            throttleProgressTimer = null
          }, 2500)
        }
      }
    })
      .then(() => {
        promiseWithResolver.resolve(void 0)
      })
      .catch((err) => {
        promiseWithResolver.reject(err)
      })

    await promiseWithResolver.promise
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.NO_ERROR)
  } catch (err) {
    console.error(err)
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.DOWNLOAD_ERROR)
  }
}
