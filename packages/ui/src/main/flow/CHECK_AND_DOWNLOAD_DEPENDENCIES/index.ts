import checkAndDownloadPuppeteer from './check-and-download-puppeteer'

export const checkAndDownloadDependenciesForInit = async () => {
  const browser = await checkAndDownloadPuppeteer({
    downloadProgressCallback(downloadedBytes: number, totalBytes: number) {
      console.log(`${downloadedBytes} / ${totalBytes}`)
    }
  })

  console.log(browser)
}
