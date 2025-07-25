import { app } from 'electron'
import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'
import {
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import {
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
} from '@geekgeekrun/geek-auto-start-chat-with-boss/constant.mjs'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'
import {
  saveJobInfoFromRecommendPage,
  saveChatStartupRecord,
  saveMarkAsNotSuitRecord,
  saveChatMessageRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import { getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { MarkAsNotSuitReason, JobSource } from '@geekgeekrun/sqlite-plugin/dist/enums'

import fs from 'node:fs'
import { Target } from 'puppeteer'
import { pipeWriteRegardlessError } from '../utils/pipe'
import * as JSONStream from 'JSONStream'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import gtag from '../../utils/gtag'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import { type ChatMessageRecord } from '@geekgeekrun/sqlite-plugin/src/entity/ChatMessageRecord'
import { BossInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/BossInfo'
import { messageForSaveFilter } from '../../../common/utils/chat-list'

import {
  ensureEditThisCookie,
  editThisCookieExtensionPath
} from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension/utils.mjs'

const dbInitPromise = initDb(getPublicDbFilePath())

const attachRequestsListener = async (target: Target) => {
  const page = await target.page()
  if (!page) {
    return
  }
  async function getCurrentJobSource() {
    const methodMap = {
      async recommend() {
        return await page.evaluate(
          ({ RECOMMEND_JOB_ENTRY_SELECTOR }) => {
            return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR).classList.contains('active')
          },
          {
            RECOMMEND_JOB_ENTRY_SELECTOR
          }
        )
      },
      async expect() {
        return await page.evaluate(
          ({ USER_SET_EXPECT_JOB_ENTRIES_SELECTOR }) => {
            return [...document.querySelectorAll(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)].some((el) =>
              el.classList.contains('active')
            )
          },
          {
            USER_SET_EXPECT_JOB_ENTRIES_SELECTOR
          }
        )
      },
      async search() {
        const elHandle = await page.$(`.page-jobs-main`)
        const currentKeyWord = await elHandle?.evaluate((el) => {
          return el?.__vue__?.formData?.query
        })
        return !!currentKeyWord
      }
    }
    for (const [type, func] of Object.entries(methodMap)) {
      try {
        if (await func()) {
          return type
        }
      } catch (err) {
        console.error('encounter error when get job source')
      }
    }
    return null
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
      page.url().startsWith('https://www.zhipin.com/web/geek/jobs') &&
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
      const jobSource = await getCurrentJobSource()
      const markDetail = {
        markFrom: ChatStartupFrom.ManuallyFromRecommendList,
        extInfo: {
          chosenReasonInUi: {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        },
        markReason: MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON,
        jobSource: JobSource[jobSource]
      }
      gtag('job_marked_as_not_suit', {
        markFrom: markDetail.markFrom,
        bossActiveTimeDesc: currentJobData?.bossInfo?.activeTimeDesc,
        encryptJobId: currentJobData?.jobInfo?.encryptId,
        jobSource: JobSource[jobSource]
      })
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
      page.url().startsWith('https://www.zhipin.com/web/geek/jobs') &&
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
      const jobSource = await getCurrentJobSource()
      gtag('new_chat_startup', {
        chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList,
        encryptJobId: currentJobData?.jobInfo?.encryptId,
        jobSource: JobSource[jobSource]
      })
      await saveChatStartupRecord(
        await dbInitPromise,
        currentJobData,
        {
          encryptUserId: currentUserInfo.encryptUserId
        },
        {
          chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList,
          jobSource: JobSource[jobSource]
        }
      )
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/chat') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpchat/geek/historyMsg')
    ) {
      const currentUserInfo = await page.evaluate(
        'document.querySelector(".main-wrap").__vue__.$store.state.userInfo'
      )
      const request = response.request().url()

      const url = new URL(request)
      const encryptBossIdInAddFriendUrl = url.searchParams.get('bossId')

      const bossInfo =
        (await page.evaluate(
          'document.querySelector(".chat-conversation .chat-record")?.__vue__?.boss'
        )) ?? null
      if (!bossInfo) {
        console.warn('cannot find boss info on page.')
        return
      }
      const ds = await dbInitPromise
      // save boss info
      const bossInfoRepository = ds.getRepository(BossInfo)
      let targetBossInfo = await bossInfoRepository.findOneBy({
        encryptBossId: bossInfo.encryptBossId
      })
      if (!targetBossInfo) {
        targetBossInfo = new BossInfo()
        Object.assign(targetBossInfo, {
          encryptBossId: bossInfo.encryptBossId,
          name: bossInfo.name,
          title: bossInfo.title,
          date: new Date()
        })
        await bossInfoRepository.save(targetBossInfo)
      }
      if (encryptBossIdInAddFriendUrl !== bossInfo.encryptBossId) {
        return
      }
      const rawChatRecordList =
        (
          await page.evaluate(
            'document.querySelector(".message-content .chat-record").__vue__.list$'
          )
        )?.filter(messageForSaveFilter) ?? []

      const chatRecordList = rawChatRecordList.map(it => {
        const mappedItem = {} as InstanceType<typeof ChatMessageRecord>
        mappedItem.mid = it.mid
        mappedItem.encryptFromUserId = it.isSelf ? currentUserInfo.encryptUserId : bossInfo.encryptBossId
        mappedItem.encryptToUserId = it.isSelf ? bossInfo.encryptBossId : currentUserInfo.encryptUserId
        mappedItem.style = it.isSelf ? 'sent' : 'received'
        mappedItem.type = it.type
        mappedItem.time = it.time ? new Date(it.time) : null
        mappedItem.text = it.text
        if (it.type === 'image') {
          mappedItem.imageUrl = it.image?.originImage?.url
          mappedItem.imageHeight = it.image?.originImage?.url?.height
          mappedItem.imageWidth = it.image?.originImage?.url?.width
        }

        return mappedItem
      })
      await saveChatMessageRecord(ds, chatRecordList)
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
  await ensureEditThisCookie()
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

attachListenerForKillSelfOnParentExited()
