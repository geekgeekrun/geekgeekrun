import { app } from 'electron'
import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import extractZip from 'extract-zip'
import {
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'
import {
  saveJobInfoFromRecommendPage,
  saveChatStartupRecord,
  saveMarkAsNotSuitRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { MarkAsNotSuitReason } from '@geekgeekrun/sqlite-plugin/dist/enums'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import url from 'url'
import packageJson from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension/package.json' assert { type: 'json' }
import { Target } from 'puppeteer'
import { pipeWriteRegardlessError } from '../utils/pipe'
import * as JSONStream from 'JSONStream'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import gtag from '../../utils/gtag'

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
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json')
    ) {
      const rawReasonResData = (await response.json())?.zpData?.result ?? []
      const reasonCodeToTextMap = await readStorageFile(
        'job-not-suit-reason-code-to-text-cache.json'
      )
      for (const it of rawReasonResData) {
        reasonCodeToTextMap[it.code] = it.text?.content ?? ''
      }
      await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/job-recommend') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json')
    ) {
      const currentJobData = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.data'
      )
      const requestBody = new URLSearchParams(response.request().postData())

      const securityIdInRequest = requestBody.get("securityId")
      const currentJobSecurityId = currentJobData?.securityId

      if (securityIdInRequest !== currentJobSecurityId) {
        return
      }

      const chosenCode = Number(requestBody.get('code'))
      const currentUserInfo = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.$store.state.userInfo'
      )
      const reasonCodeToTextMap = await readStorageFile(
        'job-not-suit-reason-code-to-text-cache.json'
      )

      const markDetail = {
        markFrom: ChatStartupFrom.ManuallyFromRecommendList,
        extInfo: {
          chosenReasonInUi: {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        },
        markReason: MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON
      }
      gtag('job_marked_as_not_suit', { markFrom: markDetail.markFrom })
      if (reasonCodeToTextMap[chosenCode]?.includes('活跃度低')) {
        markDetail.markReason = MarkAsNotSuitReason.BOSS_INACTIVE
        markDetail.extInfo.bossActiveTimeDesc = currentJobData?.bossInfo.activeTimeDesc
      }
      await saveMarkAsNotSuitRecord(
        await dbInitPromise,
        currentJobData,
        {
          encryptUserId: currentUserInfo.encryptUserId
        },
        markDetail
      )
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/job-recommend') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json')
    ) {
      const request = response.request().url()

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
      gtag('new_chat_startup', { chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList })
      await saveChatStartupRecord(
        await dbInitPromise,
        currentJobData,
        {
          encryptUserId: currentUserInfo.encryptUserId
        },
        {
          chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList
        }
      )
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
  app.dock?.hide()
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

  //#region pipe
  let pipeForWrite: null | fs.WriteStream = null
  let pipeForRead: null | fs.ReadStream = null
  try {
    pipeForWrite = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.warn('pipeForWrite is not available')
  }
  try {
    pipeForRead = fs.createReadStream(null, { fd: 3 })
  } catch {
    console.warn('pipeForRead is not available')
  }
  pipeForRead?.pipe(JSONStream.parse())?.on('data', async function handler(data) {
    if (data.type !== 'NEW_WINDOW') {
      return
    }
    const page = await browser.newPage()
    await page.goto(data.url)
  })

  pipeWriteRegardlessError(
    pipeForWrite,
    JSON.stringify({
      type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY'
    })
  )
  //#endregion
  gtag('launch_boss_site_ready')
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
    pipeWriteRegardlessError(
      pipeForWrite,
      JSON.stringify({
        type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED'
      })
    )
    process.exit(0)
  })

  const tempPage = await browser.newPage()
  await page.close()
  page = tempPage
}
