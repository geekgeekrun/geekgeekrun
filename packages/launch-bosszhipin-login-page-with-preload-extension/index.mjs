
import {
  initPuppeteer
} from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'
import { blockNavigation } from '@geekgeekrun/utils/puppeteer/block-navigation.mjs'
import {
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

import JSON5 from 'json5'
import url from 'url';
import {
  runtimeFolderPath,
  ensureEditThisCookie,
  editThisCookieExtensionPath,
} from './utils.mjs'

import { EventEmitter } from 'node:events'

export const loginEventBus = new EventEmitter()

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export async function main() {
  await ensureEditThisCookie()
  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--load-extension=${editThisCookieExtensionPath}`
    ]
  })

  const closeAttachedSet = new WeakSet()
  browser.on('targetcreated', async function closeNewTabs(target) {
    let targetBrowser = target.browser();
    const pages = await targetBrowser.pages()
    console.log(pages)
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i]
      if (!closeAttachedSet.has(page)) {
        closeAttachedSet.add(page)
        page.once('domcontentloaded', () => {
          page.close()
        })
      }
    }
  })

  const [page] = await browser.pages();

  page.once('close', async () => {
    browser.close()
    const electron = await import('electron')
    electron.app.quit()
  })

  const { dispose: disposeNavigationLock } = await blockNavigation(page, (req) => !req.url().startsWith('https://www.zhipin.com'))
  await page.goto('https://www.zhipin.com/web/user/');

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

  Promise.all([
    Promise.race(loginSuccessPromiseList),
    page.waitForNavigation({
      timeout: 0
    }),
  ]).then(async () => {
    await sleep(2000)
    const headerLogoAnchorHandler = await page.$('.header-home-logo')
    return Promise.all([
      headerLogoAnchorHandler ? headerLogoAnchorHandler.click() : page.goto('https://www.zhipin.com/'),
      page.waitForNavigation({
        timeout: 0,
      })
    ])
  }).then(async () => {
    if (
      page.url().startsWith('https://www.zhipin.com/web/common/security-check.html')
    ) {
      await page.waitForNavigation({
        timeout: 0,
      })
    }
    await sleep(2000)
    const cookies = await page.cookies()
    loginEventBus.emit(
      'cookie-collected',
      cookies
    )
    return writeStorageFile('boss-cookies.json', cookies)
  }).catch((err) => {
    console.log(err)
  })
}
