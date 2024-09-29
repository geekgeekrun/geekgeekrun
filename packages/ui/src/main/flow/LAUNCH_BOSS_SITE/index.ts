import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import extractZip from 'extract-zip'
import { readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'
import {
  saveJobInfoFromRecommendPage,
  saveChatStartupRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'url'
import packageJson from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension/package.json' assert { type: 'json' }
import { Target } from 'puppeteer'

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
const dbInitPromise = initDb(getPublicDbFilePath())

const attachRequestsListener = async (target: Target) => {
  const page = await target.page()
  if (!page) {
    return
  }

  page.on('response', async (response) => {
    if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
      const data = await response.json()

      console.log(data)
      if (data.code === 0) {
        await saveJobInfoFromRecommendPage(await dbInitPromise, data.zpData)
      }
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/job-recommend') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json')
    ) {
      const request = (await response.request()).url()

      const url = new URL(request)
      const jobIdInAddFriendUrl = url.searchParams.get('jobId')

      // access current page, predict if jobId of current page is equal to jobId in request
      // in case of page changed after startup chat
      const currentJobData = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.data'
      )
      const currentJobId = currentJobData?.jobInfo?.encryptId
      if (jobIdInAddFriendUrl !== currentJobId) {
        return
      }

      const currentUserInfo = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.$store.state.userInfo'
      )
      await saveChatStartupRecord(await dbInitPromise, currentJobData, {
        encryptUserId: currentUserInfo.encryptUserId
      })
    }
  })

  await page.waitForResponse((response) => {
    if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
      return true
    }
    return false
  })
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
  let [page] = await browser.pages()
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }

  const localStoragePageUrl = `https://www.zhipin.com/desktop/`
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)

  browser.on('targetcreated', (target) => {
    attachRequestsListener(target)
  })
  browser.on('targetdestroyed', async () => {
    const pages = await browser.pages()
    if (pages.length) {
      return
    }
    const cp = browser.process()
    cp.kill()
    process.exit(0)
  })

  const newPage = await await browser.newPage()
  await page.close()
  page = newPage
  await page.goto('https://www.zhipin.com/web/user/')
}
