
import {
  initPuppeteer
} from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'
import extractZip from 'extract-zip'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path';
import JSON5 from 'json5'
import url from 'url';

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
const editThisCookieZipPath = path.join(__dirname, 'extensions', 'EditThisCookie.zip')
const editThisCookieExtensionPath = path.join(extensionDir, 'EditThisCookie')

async function main() {
  if (!fs.existsSync(
    path.join(editThisCookieExtensionPath, 'manifest.json')
  )) {
    await extractZip(
      editThisCookieZipPath,
      {
        dir: extensionDir
      }
    )
  }

  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--load-extension=${editThisCookieExtensionPath}`,
      `https://www.zhipin.com/web/user/`
    ]
  })
}

main()