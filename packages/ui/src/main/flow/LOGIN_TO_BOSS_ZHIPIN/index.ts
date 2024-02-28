import { app } from 'electron'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { blockNavigation } from '@geekgeekrun/utils/puppeteer/block-navigation.mjs'
import path from 'node:path'
import os from 'node:os'
import { getAnyAvailablePuppeteerExecutable } from '../CHECK_AND_DOWNLOAD_DEPENDENCIES'

const entryPageUrl = `https://www.zhipin.com/web/geek/job-recommend`
const loginPageUrl = `https://www.zhipin.com/web/user/`
export const getBossZhipinUserInfo = async () => {
  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
  const { puppeteer } = await initPuppeteer()

  const browserToUse = await getAnyAvailablePuppeteerExecutable()
  if (!browserToUse) {
    console.log({ type: 'NEED_TO_CHECK_DEPENDENCIES' })
    process.exit(1)
    return
  }

  const userDataDirPath = path.join(os.homedir(), '.geekgeekrun', 'userData', browserToUse.browser)
  let browser, page

  try {
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140
      },
      userDataDir: userDataDirPath
    })

    page = await browser.newPage()

    await page.goto(entryPageUrl, {
      timeout: 0,
      waitUntil: 'domcontentloaded'
    })
    const userInfo = await (
      await page.waitForResponse((response) => {
        if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
          return true
        }
        return false
      })
    ).json()

    console.log({ type: 'GET_USER_INFO_SUCCESS', data: userInfo })
    return userInfo
  } catch (err) {
    console.log({ type: 'GET_USER_INFO_ERROR' })
    console.error(err)
    throw err
  } finally {
    browser.close()
  }
}

export const loginToBossZhipin = async () => {
  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
  let isParentProcessDisconnect = true
  process.on('disconnect', () => {
    isParentProcessDisconnect = true
    app.exit()
  })

  const { puppeteer } = await initPuppeteer()

  let hasLogin = false
  let userInfoResponse

  try {
    userInfoResponse = await getBossZhipinUserInfo()
    hasLogin = userInfoResponse.code === 0
  } catch {
    //
  }
  if (hasLogin) {
    console.log({ type: 'PERVIOUS_LOGIN_STATUS_IS_VALID' })
    app.exit()
    return
  }
  console.log({ type: 'NEED_TO_LOGIN' })

  let browser, page
  if (!puppeteer) {
    await initPuppeteer()
  }

  const browserToUse = await getAnyAvailablePuppeteerExecutable()
  if (!browserToUse) {
    console.log({ type: 'NEED_TO_CHECK_DEPENDENCIES' })
    app.exit(1)
    return
  }

  const userDataDirPath = path.join(os.homedir(), '.geekgeekrun', 'userData', browserToUse.browser)

  try {
    browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140
      },
      devtools: true,
      userDataDir: userDataDirPath
    })

    page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })

    page.once('close', () => {
      if (!hasLogin) {
        console.log({ type: 'USER_IS_NOT_LOGIN_UNTIL_PAGE_CLOSED' })
        app.exit(1)
        return
      }
    })

    await page.goto(entryPageUrl, {
      timeout: 0,
      waitUntil: 'domcontentloaded'
    })
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
    hasLogin = true
    console.log({ type: 'USER_LOGIN_SUCCESSFUL' })
    app.exit()
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
}
