import { app } from 'electron'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { blockNavigation } from '@geekgeekrun/utils/puppeteer/block-navigation.mjs'

export const loginToBossZhipin = async () => {
  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
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
        height: 900 - 140
      },
      devtools: true
    })

    page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })

    const entryPageUrl = `https://www.zhipin.com/web/geek/job-recommend`
    const loginPageUrl = `https://www.zhipin.com/web/user/`
    await page.goto(entryPageUrl, {
      timeout: 0,
      waitUntil: 'domcontentloaded'
    })
    const userInfoResponse = await (
      await page.waitForResponse((response) => {
        if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
          return true
        }
        return false
      })
    ).json()
    if (userInfoResponse.code === 7) {
      await page.goto(loginPageUrl, {
        timeout: 0
      })
    }
    console.log(userInfoResponse)
  } catch (err) {
    console.error(err)
    throw err
  }
}
