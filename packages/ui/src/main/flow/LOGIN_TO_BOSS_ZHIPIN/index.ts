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
    let userInfoResponse
    userInfoResponse = await (
      await page.waitForResponse((response) => {
        if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
          return true
        }
        return false
      })
    ).json()
    while (userInfoResponse.code !== 0) {
      await page.goto(loginPageUrl, {
        timeout: 0
      })
      const loginSuccessPromiseList = [
        page.waitForResponse(
          (response) =>
            response.url().startsWith('https://www.zhipin.com/wapi/zppassport/qrcode/loginConfirm'),
          {
            timeout: 0
          }
        ),
        page.waitForResponse(
          (response) =>
            response.url().startsWith('https://www.zhipin.com/wapi/zppassport/qrcode/dispatcher'),
          {
            timeout: 0
          }
        ),
        page.waitForResponse(
          (response) =>
            response.url().startsWith('https://www.zhipin.com/wapi/zppassport/login/phoneV2'),
          { timeout: 0 }
        )
      ]
      const { dispose: disposeBlockNavigation } = await blockNavigation(page, (req) => {
        const requestUrl = req.url()
        return requestUrl !== loginPageUrl
      })

      const loginSuccessResponse = await (await Promise.race(loginSuccessPromiseList)).json()

      await disposeBlockNavigation()

      const redirectUrl =
        loginSuccessResponse.zpData.pcToUrl ?? loginSuccessResponse.zpData.toUrl ?? entryPageUrl

      await Promise.all([
        page.goto(redirectUrl),
        page.waitForNavigation({
          waitUntil: 'domcontentloaded'
        })
      ])
      userInfoResponse = await (
        await page.waitForResponse((response) => {
          if (
            response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')
          ) {
            return true
          }
          return false
        })
      ).json()
    }
    console.log('logined')
  } catch (err) {
    console.error(err)
    throw err
  }
}
