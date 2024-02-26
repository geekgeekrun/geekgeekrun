import { app } from 'electron'
import {
  sleep
} from '@geekgeekrun/utils/sleep.mjs'

;(async () => {
  const { initPuppeteer, closeBrowserWindow } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
  )
  let isParentProcessDisconnect = true
  process.on('disconnect', () => {
    isParentProcessDisconnect = true
    app.exit()
  })

  const { puppeteer } = await initPuppeteer()

  let browser, page
  if (!puppeteer) {
    await initPuppeteer()
  }
  try {
    browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      },
      devtools: true
    })

    page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })

    await Promise.all([
      page.goto(`https://www.zhipin.com/web/geek/chat`, { timeout: 0 }),
      page.waitForNavigation(),
    ])

    // TODO:
  } catch (err) {
    closeBrowserWindow()

    console.error(err)
    throw err
  }
})()
