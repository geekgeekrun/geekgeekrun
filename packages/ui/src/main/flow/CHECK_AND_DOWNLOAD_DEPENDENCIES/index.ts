import { app } from 'electron'
import checkAndDownloadPuppeteer from './check-and-download-puppeteer'
import * as net from 'net'

export enum DOWNLOAD_ERROR_EXIT_CODE {
  NO_ERROR = 0,
  DOWNLOAD_ERROR = 1
}
export const checkAndDownloadDependenciesForInit = async () => {
  app.dock.hide()
  let pipe: null | net.Socket = null
  try {
    pipe = new net.Socket({ fd: 3 })
  } catch {
    console.warn('pipe is not available')
  }

  pipe?.write(
    JSON.stringify({
      type: 'NEED_RESETUP_DEPENDENCIES'
    }) + '\r\n'
  )

  try {
    let timeoutTimer = 0
    await new Promise((resolve, reject) => {
      checkAndDownloadPuppeteer({
        downloadProgressCallback(downloadedBytes: number, totalBytes: number) {
          clearTimeout(timeoutTimer)
          if (downloadedBytes !== totalBytes) {
            timeoutTimer = setTimeout(() => {
              // will encounter this when network disconnected when downloading
              reject(new Error('PROGRESS_NOT_CHANGED_TOO_LONG'))
            }, 30 * 1000)
          }
          console.log(downloadedBytes / totalBytes)
          pipe?.write(
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
