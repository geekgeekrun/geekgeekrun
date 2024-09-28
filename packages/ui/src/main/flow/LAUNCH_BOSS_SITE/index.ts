import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import extractZip from 'extract-zip'
import { readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'url'
import packageJson from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension/package.json' assert { type: 'json' }

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const isRunFromUi = Boolean(process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE)

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
const extensionDir = path.join(runtimeFolderPath, 'chrome-extensions')
if (!fs.existsSync(runtimeFolderPath)) {
  fs.mkdirSync(runtimeFolderPath)
}
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir)
}
const editThisCookieExtensionPath = path.join(extensionDir, 'EditThisCookie')

let editThisCookieZipPath
async function getEditThisCookieZipPath() {
  if (editThisCookieZipPath) {
    return editThisCookieZipPath
  }
  if (isRunFromUi) {
    const { app } = await import('electron')
    editThisCookieZipPath = path.join(
      app.getAppPath(),
      './node_modules',
      packageJson.name,
      'extensions',
      'EditThisCookie.zip'
    )
  } else {
    editThisCookieZipPath = path.join(__dirname, 'extensions', 'EditThisCookie.zip')
  }
  return editThisCookieZipPath
}

export async function launchBossSite() {
  if (!fs.existsSync(path.join(editThisCookieExtensionPath, 'manifest.json'))) {
    await extractZip(await getEditThisCookieZipPath(), {
      dir: extensionDir
    })
  }

  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')

  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--load-extension=${editThisCookieExtensionPath}`]
  })
  const [page] = await browser.pages()
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }

  const localStoragePageUrl = `https://www.zhipin.com/desktop/`
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)

  await page.goto('https://www.zhipin.com/web/user/')
}
