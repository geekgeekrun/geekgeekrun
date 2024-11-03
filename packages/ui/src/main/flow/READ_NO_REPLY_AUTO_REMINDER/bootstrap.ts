import { Browser } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { pageMapByName } from './index'

import { readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'
const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const bossChatUiUrl = `https://www.zhipin.com/web/geek/chat`
const bossCookies = readStorageFile('boss-cookies.json')
const bossLocalStorage = readStorageFile('boss-local-storage.json')

puppeteer.use(StealthPlugin())

export async function bootstrap() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    defaultViewport: {
      width: 1440,
      height: 800
    },
    devtools: true
  })

  return browser
}

export async function launchBoss(browser: Browser) {
  const page = (await browser.pages())[0]
  //set cookies
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
  await Promise.all([page.goto(bossChatUiUrl, { timeout: 0 }), page.waitForNavigation()])
  pageMapByName['boss'] = page
  page.once('close', () => {
    pageMapByName['boss'] = null
    const cp = browser.process()
    cp?.kill()
  })
  return page
}
