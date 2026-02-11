import { Browser } from 'puppeteer'
import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import { pageMapByName } from './index'

import { readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'

const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const bossChatUiUrl = `https://www.zhipin.com/web/geek/chat`

export async function bootstrap() {
  const { puppeteer } = await initPuppeteer()

  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    defaultViewport: {
      width: 1440,
      height: 800
    },
    devtools: process.env.NODE_ENV === 'development'
  })

  return browser
}

export async function launchBoss(browser: Browser) {
  const page = (await browser.pages())[0]
  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')
  //set cookies
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
  try {
    await Promise.all([
      page.goto(bossChatUiUrl, { timeout: 0 }),
      page.waitForNavigation({ timeout: 120 * 1000 })
    ])
  } catch (error) {
    if (error?.message?.startsWith('net::ERR_INTERNET_DISCONNECTED')) {
      throw new Error('ERR_INTERNET_DISCONNECTED')
    }
    throw error
  }
  pageMapByName['boss'] = page
  page.once('close', () => {
    pageMapByName['boss'] = null
    const cp = browser.process()
    cp?.kill()
  })
  return page
}
