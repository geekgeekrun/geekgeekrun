import { app } from 'electron'
import checkAndDownloadPuppeteer from './check-and-download-puppeteer'
import * as net from 'net'

export enum DOWNLOAD_ERROR_EXIT_CODE {
  NO_ERROR = 0,
  DOWNLOAD_ERROR = 1
}
export const checkAndDownloadDependenciesForInit = async () => {
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
    await checkAndDownloadPuppeteer({
      downloadProgressCallback(downloadedBytes: number, totalBytes: number) {
        pipe?.write(
          JSON.stringify({
            type: 'PUPPETEER_DOWNLOAD_PROGRESS',
            totalBytes,
            downloadedBytes
          })
        ) + '\r\n'
      }
    })
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.NO_ERROR)
  } catch (err) {
    app.exit(DOWNLOAD_ERROR_EXIT_CODE.DOWNLOAD_ERROR)
  }
}
