import checkAndDownloadPuppeteer from './check-and-download-puppeteer'
import * as net from 'net'

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

  let browser
  try {
    browser = await checkAndDownloadPuppeteer({
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
    pipe?.write(
      JSON.stringify({
        type: 'PUPPETEER_DOWNLOAD_FINISHED'
      })
    ) + '\r\n'
  } catch (err) {
    pipe?.write(
      JSON.stringify({
        type: 'PUPPETEER_DOWNLOAD_ERROR'
      })
    ) + '\r\n'
  }

  console.log(browser)
}
