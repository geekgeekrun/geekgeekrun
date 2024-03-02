
import {
  initPuppeteer
} from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'
import extractZip from 'extract-zip'
import { blockNavigation } from '@geekgeekrun/utils/puppeteer/block-navigation.mjs'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path';
import JSON5 from 'json5'
import url from 'url';
import packageJson from './package.json' assert {type: 'json'}

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const isRunFromUi = Boolean(process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE)
const isUiDev = process.env.NODE_ENV === 'development'

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
const extensionDir = path.join(
  runtimeFolderPath,
  'chrome-extensions'
)
if (!fs.existsSync(
  runtimeFolderPath
)) {
  fs.mkdirSync(runtimeFolderPath)
}
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir)
}
const editThisCookieExtensionPath = path.join(extensionDir, 'EditThisCookie')

let editThisCookieZipPath
async function getEditThisCookieZipPath () {
  if (editThisCookieZipPath) {
    return editThisCookieZipPath
  }
  if (isRunFromUi) {
    const { app } = await import('electron')
    editThisCookieZipPath = path.join(app.getAppPath(), './node_modules', packageJson.name, 'extensions', 'EditThisCookie.zip')
  } else {
    editThisCookieZipPath = path.join(__dirname, 'extensions', 'EditThisCookie.zip')
  }
  return editThisCookieZipPath
}

export async function main() {
  if (!fs.existsSync(
    path.join(editThisCookieExtensionPath, 'manifest.json')
  )) {
    await extractZip(
      await getEditThisCookieZipPath(),
      {
        dir: extensionDir
      }
    )
  }

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
    if (isRunFromUi) {
      const electron = await import('electron')
      electron.app.quit()
    }
  })

  const { dispose: disposeNavigation } = await blockNavigation(page, (req) => !req.url().startsWith('https://www.zhipin.com'))
  await page.goto('https://www.zhipin.com/web/user/');
}
