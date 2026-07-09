import { bootstrap, launchBoss } from './bootstrap'
import { MsgStatus, type ChatListItem } from './types'
import { Browser, Page } from 'puppeteer'
import { getGptContent, sendLookForwardReplyEmotion, sendMessage } from './boss-operation'
import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import { waitForPage } from '@geekgeekrun/utils/puppeteer/wait.mjs'
import { app, dialog } from 'electron'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import {
  getPublicDbFilePath,
  readConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChatMessageRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatMessageRecord.js'
import {
  saveChatMessageRecord,
  getJobHireStatusRecord,
  saveJobHireStatusRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers.js'
import {
  writeStorageFile,
  readStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { BossInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/BossInfo.js'
import { messageForSaveFilter } from '../../../common/utils/chat-list'
import {
  AUTO_CHAT_ERROR_EXIT_CODE,
  OPEN_CONTENT_SOURCE,
  RECHAT_CONTENT_SOURCE,
  RECHAT_LLM_FALLBACK
} from '../../../common/enums/auto-start-chat'
import gtag from '../../utils/gtag'
import { JobHireStatus } from '@geekgeekrun/sqlite-plugin/dist/enums.js'
import dayjs from 'dayjs'
import cheerio from 'cheerio'
import { connectToDaemon, sendToDaemon } from '../OPEN_SETTING_WINDOW/connect-to-daemon'
// import { pushCurrentPageScreenshot, SCREENSHOT_INTERVAL_MS } from '../../utils/screenshot'
import { checkShouldExit } from '../../utils/worker'
import minimist from 'minimist'
import { checkCookieListFormat } from '../../../common/utils/cookie'
import { loginWithCookieAssistant } from '../../features/login-with-cookie-assistant'
import initPublicIpc from '../../utils/initPublicIpc'
import { getLastUsedAndAvailableBrowser } from '../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { configWithBrowserAssistant } from '../../features/config-with-browser-assistant'
import { DEFAULT_CONSTANT_OPEN_CONTENT_SEGS } from '../../../common/constant'
import {
  HR_REPLY_DECISION,
  classifyHrMessage,
  buildAutoReply,
  buildReviewDraft,
  validateAutoReply,
  appendApprovalRequest
} from '../../features/hr-reply-policy.mjs'
import {
  readApprovalQueue,
  markAutoReplySent,
  markAutoReplyFailed,
  markAutoReplyExpired
} from '../../../../../ggr-controller/index.mjs'

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在退出')
  process.exit(0)
})

const throttleIntervalMinutes =
  readConfigFile('boss.json').autoReminder?.throttleIntervalMinutes ?? 10
const rechatLimitDay = readConfigFile('boss.json').autoReminder?.rechatLimitDay ?? 21
const recentMessageQuantityForLlm =
  readConfigFile('boss.json').autoReminder?.recentMessageQuantityForLlm ?? 8
const rechatContentSource =
  readConfigFile('boss.json').autoReminder?.rechatContentSource ??
  RECHAT_CONTENT_SOURCE.LOOK_FORWARD_EMOTION
const rechatLlmFallback =
  readConfigFile('boss.json').autoReminder?.rechatLlmFallback ??
  RECHAT_LLM_FALLBACK.SEND_LOOK_FORWARD_EMOTION

const fieldsForUseCommonConfig = readConfigFile('boss.json').fieldsForUseCommonConfig ?? {}
const commonJobConditionConfig = readConfigFile('common-job-condition-config.json') ?? {}
const expectJobTypeRegExpStr =
  (!fieldsForUseCommonConfig.jobDetail ? readConfigFile('boss.json') : commonJobConditionConfig)
    ?.expectJobTypeRegExpStr ?? ''
const onlyRemindBossWithExpectJobType =
  readConfigFile('boss.json').autoReminder?.onlyRemindBossWithExpectJobType ??
  !!expectJobTypeRegExpStr

const blockCompanyNameRegExpStr =
  (!fieldsForUseCommonConfig.blockCompanyNameRegExpStr
    ? readConfigFile('boss.json')
    : commonJobConditionConfig
  )?.blockCompanyNameRegExpStr ?? ''

const blockCompanyNameRegExp = (() => {
  if (!blockCompanyNameRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(blockCompanyNameRegExpStr, 'im')
  } catch {
    return null
  }
})()
const onlyRemindBossWithoutBlockCompanyName =
  readConfigFile('boss.json').autoReminder?.onlyRemindBossWithoutBlockCompanyName ??
  !!blockCompanyNameRegExp
const agentReplyPolicy = readConfigFile('boss.json').agentReplyPolicy

const openContentSource =
  readConfigFile('boss.json').autoReminder?.openContentSource ??
  OPEN_CONTENT_SOURCE.CONSTANT_CONTENT
const constantOpenContent = (() => {
  let constantOpenContent = readConfigFile('boss.json').autoReminder?.constantOpenContent ?? ''
  if (constantOpenContent?.trim?.()) {
    return constantOpenContent
  } else {
    if (rechatContentSource === RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT) {
      constantOpenContent = DEFAULT_CONSTANT_OPEN_CONTENT_SEGS.join(`；`)
    } else {
      constantOpenContent = DEFAULT_CONSTANT_OPEN_CONTENT_SEGS[0]
    }
  }
  return constantOpenContent
})()

const dbInitPromise = initDb(getPublicDbFilePath())
let lastHeadlessLoggedChatMessageKey = ''

export const pageMapByName: {
  boss?: Page | null
} = {}

// async function periodPushCurrentPageScreenshot () {
//   try {
//     if (pageMapByName.boss?.isClosed()) {
//       return
//     }
//     const shouldExit = await checkShouldExit()
//     if (shouldExit) {
//       return
//     }
//     try {
//       await pushCurrentPageScreenshot(pageMapByName.boss)
//     }
//     catch (err) {
//       if (err?.message?.includes(`PAGE_CLOSED`)) {
//         return
//       }
//     }
//     setTimeout(periodPushCurrentPageScreenshot, SCREENSHOT_INTERVAL_MS)
//   }
//   catch {}
// }

// periodPushCurrentPageScreenshot()

async function saveCurrentChatRecord(page) {
  const userInfo = await page.evaluate(
    'document.querySelector(".main-wrap").__vue__.$store.state.userInfo'
  )
  const bossInfo = await page.evaluate(
    'document.querySelector(".chat-conversation .chat-record")?.__vue__?.boss'
  )

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

  const rawChatRecordList =
    (
      await page.evaluate(
        'document.querySelector(".message-content .chat-record").__vue__.records$'
      )
    )?.filter((msg) => ['received', 'sent'].includes(msg.style)) ?? []
  const chatRecordList = rawChatRecordList.map((it) => {
    const mappedItem = {} as InstanceType<typeof ChatMessageRecord>
    mappedItem.mid = it.mid
    mappedItem.encryptFromUserId =
      it.style === 'sent'
        ? userInfo.encryptUserId
        : it.style === 'received'
          ? bossInfo.encryptBossId
          : ''
    mappedItem.encryptToUserId =
      it.style === 'sent'
        ? bossInfo.encryptBossId
        : it.style === 'received'
          ? userInfo.encryptUserId
          : ''
    mappedItem.style = it.style
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

  // Headless 模式终端日志 — 发送聊天消息
  if (process.env.GGR_HEADLESS === 'true' && chatRecordList.length > 0) {
    const latestMsg = chatRecordList[chatRecordList.length - 1]
    const messageKey = [
      latestMsg.mid,
      latestMsg.style,
      latestMsg.time ? Number(latestMsg.time) : '',
      latestMsg.text ?? latestMsg.imageUrl ?? ''
    ].join('|')
    if (messageKey === lastHeadlessLoggedChatMessageKey) {
      return
    }
    lastHeadlessLoggedChatMessageKey = messageKey
    try {
      const conversationInfo = await page.evaluate(
        'document.querySelector(".chat-conversation .chat-im.chat-editor")?.__vue__?.conversation$'
      )
      const hrName = bossInfo?.name ?? conversationInfo?.bossName ?? ''
      const company = conversationInfo?.brandName ?? ''
      await sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID ?? 'readNoReplyAutoReminderMain',
        data: {
          type: 'chat-message',
          direction: latestMsg.style,
          text: latestMsg.text ?? '',
          msgType: latestMsg.type ?? 'text',
          imageUrl: latestMsg.imageUrl ?? '',
          hrName,
          company
        }
      })
    } catch {
      // daemon not connected — ignore
    }
  }
}


function normalizeApprovalMatchText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isSameApprovalText(expected: unknown, actual: unknown) {
  const expectedText = normalizeApprovalMatchText(expected)
  const actualText = normalizeApprovalMatchText(actual)
  return Boolean(expectedText) && expectedText === actualText
}

function isSameApprovalField(expected: unknown, actual: unknown) {
  const expectedText = normalizeApprovalMatchText(expected)
  const actualText = normalizeApprovalMatchText(actual)
  return !expectedText || !actualText || expectedText === actualText
}

function approvalMatchesCurrentChatContext(approval: any, context: any) {
  return (
    isSameApprovalField(approval.hrName, context.hrName) &&
    isSameApprovalField(approval.company, context.company) &&
    isSameApprovalField(approval.jobTitle, context.jobTitle)
  )
}

async function notifyApprovedReplyStatus(data: Record<string, unknown>) {
  try {
    sendToDaemon({
      type: 'worker-to-gui-message',
      workerId: process.env.GEEKGEEKRUND_WORKER_ID ?? 'readNoReplyAutoReminderMain',
      data
    })
  } catch {
    // ignore GUI notification failures; queue status is the source of truth
  }
}

async function consumeApprovedAutoReplyForCurrentChat({
  page,
  selectedFriendInfo,
  conversationInfo,
  latestHistoryMessage
}: {
  page: Page
  selectedFriendInfo: any
  conversationInfo: any
  latestHistoryMessage: any
}) {
  const latestHrMessage = normalizeApprovalMatchText(latestHistoryMessage?.text)
  if (!latestHistoryMessage || latestHistoryMessage.isSelf || !latestHrMessage) {
    return false
  }

  const currentContext = {
    hrName: selectedFriendInfo?.bossName ?? selectedFriendInfo?.name ?? conversationInfo?.bossName ?? '',
    company: selectedFriendInfo?.brandName ?? conversationInfo?.brandName ?? '',
    jobTitle: selectedFriendInfo?.positionName ?? conversationInfo?.positionName ?? ''
  }
  const approvedQueue = await readApprovalQueue({ includeAll: true })
  const approvedItems = approvedQueue.filter((item: any) => item.status === 'approved_auto_reply')
  const contextMatchedItem = approvedItems.find((item: any) =>
    approvalMatchesCurrentChatContext(item, currentContext)
  )

  if (!contextMatchedItem) {
    return false
  }

  if (!isSameApprovalText(contextMatchedItem.latestHrMessage, latestHrMessage)) {
    await markAutoReplyExpired({
      id: contextMatchedItem.id,
      reason: 'latest HR message changed before worker could send approved reply'
    })
    await notifyApprovedReplyStatus({
      type: 'auto-reply-approval-expired',
      id: contextMatchedItem.id,
      latestHrMessage
    })
    return true
  }

  const draftReply = normalizeApprovalMatchText(contextMatchedItem.draftReply)
  if (!draftReply) {
    await markAutoReplyFailed({
      id: contextMatchedItem.id,
      reason: 'approved draft is empty before send'
    })
    await notifyApprovedReplyStatus({
      type: 'auto-reply-send-failed',
      id: contextMatchedItem.id,
      reason: 'approved draft is empty before send'
    })
    return true
  }

  try {
    await sendMessage(page, draftReply)
    await markAutoReplySent({ id: contextMatchedItem.id })
    await notifyApprovedReplyStatus({
      type: 'approved-auto-reply-sent',
      id: contextMatchedItem.id
    })
    gtag('hr_approved_reply_sent')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await markAutoReplyFailed({ id: contextMatchedItem.id, reason })
    await notifyApprovedReplyStatus({
      type: 'auto-reply-send-failed',
      id: contextMatchedItem.id,
      reason
    })
  }

  return true
}

async function checkJobIsClosed() {
  const encryptJobId = await pageMapByName.boss!.evaluate(() => {
    return document.querySelector('.chat-conversation .chat-im.chat-editor')?.__vue__?.conversation$
      .encryptJobId
  })
  if (!encryptJobId) {
    return false
  }
  let isJobClosed = false
  let record = await getJobHireStatusRecord(await dbInitPromise, encryptJobId)
  // not seen before, or last seen more than 6 hours ago
  // fetch new status
  if (
    !record ||
    (record.hireStatus === JobHireStatus.HIRING &&
      Date.now() - Number(dayjs(record.lastSeenDate)) > 6 * 60 * 60 * 1000)
  ) {
    const positionNameElHandle = await pageMapByName.boss!.$(
      `#main .chat-conversation [ka="geek_chat_job_detail"] .right-content`
    )
    if (!positionNameElHandle) {
      return false
    }
    positionNameElHandle.click()
    try {
      const targetPage = await waitForPage(
        pageMapByName.boss!.browser(),
        async (page) => {
          const url = page.url()
          if (
            url.startsWith(`https://www.zhipin.com/job_detail/${encryptJobId}`) &&
            (await page.evaluate(
              () =>
                !!document.querySelector('#main .job-banner') ||
                !!document.documentElement.innerText?.includes(`您访问的页面不存在`)
            ))
          ) {
            return true
          }
          return false
        },
        { timeout: 15 * 1000 }
      )
      const htmlContent = await targetPage.content()
      if (htmlContent) {
        const $ = cheerio.load(htmlContent)
        const [jobBannerEl] = $('#main .job-banner') ?? []
        if (!jobBannerEl) {
          console.log(`access might be blocked`)
          if (
            htmlContent.includes(`您访问的页面不存在`) ||
            location.href === `https://www.zhipin.com/`
          ) {
            await saveJobHireStatusRecord(await dbInitPromise, {
              encryptJobId,
              hireStatus: JobHireStatus.DELETED,
              lastSeenDate: new Date()
            })
          }
        } else {
          const [jobStatusTextEl] = $('#main .job-banner .job-status') ?? []
          if (jobStatusTextEl) {
            const jobStatusText = $(jobStatusTextEl).text()?.trim() ?? ''
            if ([`职位已关闭`].includes(jobStatusText)) {
              await saveJobHireStatusRecord(await dbInitPromise, {
                encryptJobId,
                hireStatus: JobHireStatus.CLOSED,
                lastSeenDate: new Date()
              })
            } else {
              await saveJobHireStatusRecord(await dbInitPromise, {
                encryptJobId,
                hireStatus: JobHireStatus.HIRING,
                lastSeenDate: new Date()
              })
            }
          }
        }
      }
      targetPage.close().catch(() => void 0)
    } catch (err) {
      console.log(`checkJobIsClosed error: ${err}`)
    }
    record = await getJobHireStatusRecord(await dbInitPromise, encryptJobId)
  }
  if (record.hireStatus !== JobHireStatus.HIRING) {
    isJobClosed = true
  }
  return isJobClosed
}

let browser: null | Browser = null
const mainLoop = async () => {
  if (browser) {
    try {
      const cp = browser.process()
      cp?.kill('SIGKILL')
    } catch {
      //
    } finally {
      browser = null
    }
  }
  let bossCookies = readStorageFile('boss-cookies.json')
  let cookieCheckResult = checkCookieListFormat(bossCookies)
  while (!cookieCheckResult) {
    try {
      browser && (await browser.close())
    } catch (err) {
      console.log(`close browser failed`, err)
    }
    try {
      try {
        await app.dock?.show()
        await loginWithCookieAssistant()
      } finally {
        await app.dock?.hide()
      }
      bossCookies = readStorageFile('boss-cookies.json')
      cookieCheckResult = checkCookieListFormat(bossCookies)
    } catch (err) {
      await dialog.showMessageBox({
        type: `error`,
        message: `登录状态无效`,
        detail: `请重新登录BOSS直聘`
      })
      sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID,
        data: {
          type: 'prerequisite-step-by-step-check',
          step: {
            id: 'basic-cookie-check',
            status: 'rejected'
          },
          runRecordId
        }
      })
      throw new Error('LOGIN_STATUS_INVALID')
    }
  }
  sendToDaemon({
    type: 'worker-to-gui-message',
    workerId: process.env.GEEKGEEKRUND_WORKER_ID,
    data: {
      type: 'prerequisite-step-by-step-check',
      step: {
        id: 'basic-cookie-check',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  const canNotConfirmIfHasReadMsgTemplateList = [
    'Boss还没查看你的消息',
    '你与该职位竞争者PK情况',
    '简历诊断提醒',
    '附件简历还没准备好',
    '设置合适的期望薪资范围'
  ].map((it) => new RegExp(it))
  browser = await bootstrap()
  await Promise.all([launchBoss(browser)])

  await sleep(1000)
  pageMapByName.boss!.bringToFront()
  await sleep(2000)

  const currentPageUrl = pageMapByName.boss!.url() ?? ''
  // #region
  if (currentPageUrl.startsWith('https://www.zhipin.com/web/user/')) {
    writeStorageFile('boss-cookies.json', [])
    try {
      browser && (await browser.close())
    } catch (err) {
      console.log(`close browser failed`, err)
    }
    try {
      try {
        await app.dock?.show()
        await loginWithCookieAssistant()
      } finally {
        await app.dock?.hide()
      }
    } catch (err) {
      await dialog.showMessageBox({
        type: `error`,
        message: `登录状态无效`,
        detail: `请重新登录BOSS直聘`
      })
      sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID,
        data: {
          type: 'prerequisite-step-by-step-check',
          step: {
            id: 'login-status-check',
            status: 'rejected'
          },
          runRecordId
        }
      })
      throw new Error('LOGIN_STATUS_INVALID')
    }
    throw new Error('THROW_FOR_RETRY')
  }
  if (
    currentPageUrl.startsWith('https://www.zhipin.com/web/common/403.html') ||
    currentPageUrl.startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    sendToDaemon({
      type: 'worker-to-gui-message',
      workerId: process.env.GEEKGEEKRUND_WORKER_ID,
      data: {
        type: 'prerequisite-step-by-step-check',
        step: {
          id: 'login-status-check',
          status: 'rejected'
        },
        runRecordId
      }
    })
    throw new Error('ACCESS_IS_DENIED')
  }
  if (currentPageUrl.startsWith('https://www.zhipin.com/web/user/safe/verify-slider')) {
    const validateRes: any = await pageMapByName
      .boss!.waitForResponse(
        (response) => {
          if (
            response.url().startsWith('https://www.zhipin.com/wapi/zpAntispam/v2/geetest/validate')
          ) {
            return true
          }
          return false
        },
        {
          timeout: 0
        }
      )
      .then((res) => {
        return res.json()
      })
    if (validateRes.code === 0) {
      await storeStorage(pageMapByName.boss)
      sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID,
        data: {
          type: 'prerequisite-step-by-step-check',
          step: {
            id: 'login-status-check',
            status: 'rejected'
          },
          runRecordId
        }
      })
      throw new Error('CAPTCHA_PASSED_AND_NEED_RESTART')
    }
  }
  sendToDaemon({
    type: 'worker-to-gui-message',
    workerId: process.env.GEEKGEEKRUND_WORKER_ID,
    data: {
      type: 'prerequisite-step-by-step-check',
      step: {
        id: 'login-status-check',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  // #endregion
  // check set security question tip modal
  let setSecurityQuestionTipModelProxy = await pageMapByName.boss!.$(
    '.dialog-wrap.dialog-account-safe'
  )
  if (setSecurityQuestionTipModelProxy) {
    await sleep(1000)
    setSecurityQuestionTipModelProxy = await pageMapByName.boss!.$(
      '.dialog-wrap.dialog-account-safe'
    )
    const closeButtonProxy = await setSecurityQuestionTipModelProxy?.$('.close')

    if (setSecurityQuestionTipModelProxy && closeButtonProxy) {
      await closeButtonProxy.click()
    }
  }

  let cursorToContinueFind = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await pageMapByName.boss?.waitForFunction(() => {
      return Array.isArray(document.querySelector('.main-wrap .chat-user')?.__vue__?.list)
    })
    // find target boss - with unread icon, or recommend system message
    const friendListData = (await pageMapByName.boss!.evaluate(
      `
        document.querySelector('.main-wrap .chat-user')?.__vue__?.list
      `
    )) as Array<ChatListItem>
    const toCheckItemAtIndex = friendListData.findIndex((it, index) => {
      return (
        index >= cursorToContinueFind &&
        (onlyRemindBossWithoutBlockCompanyName && blockCompanyNameRegExp
          ? !blockCompanyNameRegExp.test(it.brandName)
          : true) &&
        (rechatLimitDay && it.updateTime
          ? +new Date() - it.updateTime < rechatLimitDay * 24 * 60 * 60 * 1000
          : true) &&
        ((((it.lastIsSelf &&
          it.lastMsgStatus === MsgStatus.HAS_READ &&
          !it.lastText.includes('你撤回了')) ||
          canNotConfirmIfHasReadMsgTemplateList.some((regExp) => regExp.test(it.lastText))) &&
          !it.unreadCount) ||
          (!it.lastIsSelf && it.lastText === '开场问题，期待你的回答') ||
          (!it.lastIsSelf &&
            !!it.lastText?.trim?.() &&
            !it.lastText.includes('你撤回了') &&
            (Boolean(it.unreadCount) ||
              /[?？吗么呢]|简历|介绍|方便|沟通|薪资|面试|到岗|电话|微信|邮箱|项目|经历|学历|证书|外包|驻场|加班|出差|离职/.test(
                it.lastText
              ))))
      )
    })

    if (toCheckItemAtIndex < 0) {
      const isFinished = await pageMapByName.boss!.evaluate(
        `(document.querySelector(
          '.main-wrap .chat-user .user-list-content div[role=tfoot] .finished'
          )?.textContent ?? '').includes('没有')`
      )
      if (isFinished) {
        // list has all loaded and no more target job
        // go back to first job
        cursorToContinueFind = 0
        await pageMapByName.boss?.evaluate(() => {
          ;(() => {
            document
              .querySelector('.chat-content .user-list .user-list-content')
              ?.__vue__.scrollToIndex(0)
          })()
        })
        await sleep(10000)
      } else {
        cursorToContinueFind = friendListData.length - 1
        await pageMapByName.boss?.evaluate(() => {
          ;(() => {
            document
              .querySelector('.chat-content .user-list .user-list-content')
              ?.__vue__.scrollToBottom()
          })()
        })
        await sleep(3000)
      }
      continue
    } else {
      cursorToContinueFind = toCheckItemAtIndex
      await pageMapByName.boss?.evaluate((toCheckItemAtIndex) => {
        ;(() => {
          document
            .querySelector('.chat-content .user-list .user-list-content')
            ?.__vue__.scrollToIndex(toCheckItemAtIndex)
        })()
      }, toCheckItemAtIndex)
      await sleep(3000)

      const targetElProxy = await (async () => {
        const jsHandle = (
          await pageMapByName.boss?.evaluateHandle((encryptJobId) => {
            const jobLiEls = document.querySelectorAll(
              '.main-wrap .chat-user .user-list-content ul[role=group] li[role=listitem]'
            )
            return [...jobLiEls].find((it) => {
              return it.__vue__.source.encryptJobId === encryptJobId
            })
          }, friendListData[toCheckItemAtIndex].encryptJobId)
        )?.asElement()
        return jsHandle
      })()
      await targetElProxy?.click()
      await pageMapByName.boss!.waitForResponse((response) => {
        if (response.url().startsWith('https://www.zhipin.com/wapi/zpchat/geek/historyMsg')) {
          return true
        }
        return false
      })
    }
    await sleepWithRandomDelay(1500)
    // check if expect job type match
    let isExpectJobTypeMatch = true

    // Headless 模式终端日志 — 当前对话的企业和岗位
    if (process.env.GGR_HEADLESS === 'true') {
      try {
        const selectedFriendInfo = await pageMapByName.boss?.evaluate(
          'document.querySelector(".chat-conversation")?.__vue__?.selectedFriend$'
        )
        if (selectedFriendInfo) {
          const brand = selectedFriendInfo.brandName ?? ''
          const pos = selectedFriendInfo.positionName ?? ''
          const hr = selectedFriendInfo.bossName ?? selectedFriendInfo.name ?? ''
          if (brand || pos) {
            await sendToDaemon({
              type: 'worker-to-gui-message',
              workerId: process.env.GEEKGEEKRUND_WORKER_ID ?? 'readNoReplyAutoReminderMain',
              data: {
                type: 'worker-log',
                text: `查看对话 — ${brand} / ${pos}${hr ? ` (HR: ${hr})` : ''}`
              }
            })
          }
        }
      } catch {
        // ignore
      }
    }
    const selectedFriendInfoForReplyPolicy = (await pageMapByName.boss?.evaluate(
      `document.querySelector('.chat-conversation')?.__vue__?.selectedFriend$`
    )) as any
    if (onlyRemindBossWithExpectJobType) {
      if (!selectedFriendInfoForReplyPolicy) {
        isExpectJobTypeMatch = false
      } else {
        const jobType = selectedFriendInfoForReplyPolicy?.positionName
        if (!jobType) {
          isExpectJobTypeMatch = false
        } else {
          const regExp = new RegExp(expectJobTypeRegExpStr)
          isExpectJobTypeMatch = regExp.test(jobType)
        }
      }
    }
    const conversationInfo = (await pageMapByName.boss?.evaluate(
      `document.querySelector('.chat-conversation .chat-im.chat-editor')?.__vue__?.conversation$`
    )) as any

    const historyMessageList =
      (
        await pageMapByName.boss?.evaluate(() => {
          return document.querySelector('.message-content .chat-record')?.__vue__?.list$ ?? []
        })
      )?.filter(messageForSaveFilter) ?? []

    const lastGeekMessageSendTime = historyMessageList.findLast((it) => it.isSelf)?.time ?? 0
    const latestHistoryMessage = historyMessageList[historyMessageList.length - 1] as any
    const isJobClosed = await checkJobIsClosed()
    const approvedReplyHandled =
      !isJobClosed &&
      isExpectJobTypeMatch &&
      (await consumeApprovedAutoReplyForCurrentChat({
        page: pageMapByName.boss!,
        selectedFriendInfo: selectedFriendInfoForReplyPolicy,
        conversationInfo,
        latestHistoryMessage
      }))

    if (approvedReplyHandled) {
      cursorToContinueFind += 1
    } else if (!isJobClosed && isExpectJobTypeMatch && latestHistoryMessage && !latestHistoryMessage.isSelf) {
      const latestHrMessage = String(latestHistoryMessage.text ?? '').trim()
      const classification = classifyHrMessage(latestHrMessage, agentReplyPolicy)
      const autoReply = buildAutoReply(classification, { userName: 'Toby' })
      const validation = autoReply ? validateAutoReply(autoReply) : { ok: false, reason: 'no auto reply draft' }

      if (classification.decision === HR_REPLY_DECISION.AUTO_REPLY && validation.ok) {
        await sendMessage(pageMapByName.boss!, autoReply)
        gtag('hr_whitelist_auto_reply_sent', { intent: classification.intent })
      } else if (classification.decision === HR_REPLY_DECISION.NEEDS_APPROVAL) {
        let reviewDraft = ''
        let reviewDraftReason = ''
        try {
          const messageList = historyMessageList
            .filter((it) => it.bizType !== 101)
            .slice(-recentMessageQuantityForLlm)
          reviewDraft = buildReviewDraft(classification, await getGptContent(messageList))
        } catch (error) {
          reviewDraftReason = `model review draft failed: ${error instanceof Error ? error.message : String(error)}`
        }
        await appendApprovalRequest({
          hrName: selectedFriendInfoForReplyPolicy?.bossName ?? selectedFriendInfoForReplyPolicy?.name ?? conversationInfo?.bossName ?? '',
          company: selectedFriendInfoForReplyPolicy?.brandName ?? conversationInfo?.brandName ?? '',
          jobTitle: selectedFriendInfoForReplyPolicy?.positionName ?? conversationInfo?.positionName ?? '',
          latestHrMessage,
          detectedIntent: classification.intent,
          draftReply: reviewDraft,
          draftSource: reviewDraft ? 'model_review_draft' : 'none',
          draftSafety: 'needs_human_review',
          reason: [classification.reason, reviewDraftReason].filter(Boolean).join('; ')
        })
        try {
          sendToDaemon({
            type: 'worker-to-gui-message',
            workerId: process.env.GEEKGEEKRUND_WORKER_ID ?? 'readNoReplyAutoReminderMain',
            data: {
              type: 'approval-required',
              latestHrMessage,
              detectedIntent: classification.intent,
              reason: classification.reason
            }
          })
        } catch {
          // ignore GUI notification failures; the approval queue is already written
        }
        gtag('hr_reply_approval_required', { intent: classification.intent })
      }
      cursorToContinueFind += 1
    } else if (
      !isJobClosed &&
      isExpectJobTypeMatch &&
      latestHistoryMessage?.isSelf &&
      latestHistoryMessage?.status === MsgStatus.HAS_READ &&
      ((conversationInfo &&
        Object.hasOwn(conversationInfo, 'bothTalked') &&
        !conversationInfo.bothTalked) ||
        !historyMessageList.filter(
          (it) => !it.isSelf // not sent by me
        ).length) &&
      // don't disturb too much
      Date.now() - lastGeekMessageSendTime >=
        (throttleIntervalMinutes + 4 * Math.random()) * 60 * 1000
    ) {
      await sleepWithRandomDelay(3250)
      const messageList = historyMessageList
        .filter((it) => it.bizType !== 101 && it.isSelf)
        .slice(-recentMessageQuantityForLlm)
      if (!messageList?.length) {
        if (openContentSource === OPEN_CONTENT_SOURCE.CONSTANT_CONTENT) {
          await sendMessage(pageMapByName.boss!, constantOpenContent)
          gtag('rnrr_llm_content_sent')
        } else {
          try {
            const textToSend = await getGptContent(messageList)
            await sendMessage(pageMapByName.boss!, textToSend)
            gtag('rnrr_llm_content_sent')
          } catch (err) {
            console.log(err)
            await sendMessage(pageMapByName.boss!, constantOpenContent)
            gtag('rnrr_look_forward_reply_emotion_sent', {
              fallback: true
            })
          }
        }
      } else {
        if (rechatContentSource === RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT) {
          try {
            const textToSend = await getGptContent(messageList)
            await sendMessage(pageMapByName.boss!, textToSend)
            gtag('rnrr_llm_content_sent')
          } catch (err) {
            console.log(err)
            if (rechatLlmFallback === RECHAT_LLM_FALLBACK.SEND_LOOK_FORWARD_EMOTION) {
              await sendLookForwardReplyEmotion(pageMapByName.boss!)
              gtag('rnrr_look_forward_reply_emotion_sent', {
                fallback: true
              })
            } else {
              gtag('rnrr_encounter_error', {
                error: err
              })
              throw err
            }
          }
        } else {
          await sendLookForwardReplyEmotion(pageMapByName.boss!)
          gtag('rnrr_look_forward_reply_emotion_sent')
        }
      }
    } else {
      cursorToContinueFind += 1
    }
    await sleep(1000)
    await saveCurrentChatRecord(pageMapByName.boss!)
    await sleep(3000)
  }
}

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 5000
  }

  return v
})()

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
export async function runEntry() {
  app.dock?.hide()
  await app.whenReady()
  app.on('window-all-closed', (e) => {
    e.preventDefault()
  })
  initPublicIpc()
  await connectToDaemon()
  await sendToDaemon(
    {
      type: 'ping'
    },
    {
      needCallback: true
    }
  )
  sendToDaemon({
    type: 'worker-to-gui-message',
    workerId: process.env.GEEKGEEKRUND_WORKER_ID,
    data: {
      type: 'prerequisite-step-by-step-check',
      step: {
        id: 'worker-launch',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  if (!puppeteerExecutable) {
    try {
      await configWithBrowserAssistant({ autoFind: true })
    } catch (error) {
      //
    }
    puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  }
  if (!puppeteerExecutable) {
    await dialog.showMessageBox({
      type: `error`,
      message: `未找到可用的浏览器`,
      detail: `请重新运行本程序，按照提示安装、配置浏览器`
    })
    sendToDaemon({
      type: 'worker-to-gui-message',
      workerId: process.env.GEEKGEEKRUND_WORKER_ID,
      data: {
        type: 'prerequisite-step-by-step-check',
        step: {
          id: 'puppeteer-executable-check',
          status: 'rejected'
        },
        runRecordId
      }
    })
    throw new Error(`PUPPETEER_IS_NOT_EXECUTABLE`)
  }
  sendToDaemon({
    type: 'worker-to-gui-message',
    workerId: process.env.GEEKGEEKRUND_WORKER_ID,
    data: {
      type: 'prerequisite-step-by-step-check',
      step: {
        id: 'puppeteer-executable-check',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutable.executablePath
  while (true) {
    try {
      await mainLoop()
    } catch (err) {
      console.error(err)
      try {
        await pageMapByName['boss']?.close()
      } catch {
        //
      }
      const shouldExit = await checkShouldExit()
      if (shouldExit) {
        app.exit()
        return
      }
      // handle error
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
          break
        }
        if (err.message.includes('ERR_INTERNET_DISCONNECTED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ERR_INTERNET_DISCONNECTED)
          break
        }
        if (err.message.includes('ACCESS_IS_DENIED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ACCESS_IS_DENIED)
          break
        }
        if (
          err.message.includes(`PUPPETEER_IS_NOT_EXECUTABLE`) ||
          err.message.includes(`Could not find Chrome`) ||
          err.message.includes(`no executable was found`)
        ) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
          break
        }
        if (err.message === 'CANNOT_FIND_A_USABLE_MODEL') {
          gtag('cannot_find_a_usable_model')
          await dialog.showMessageBox({
            type: 'error',
            message:
              '未找到可以使用的模型，请确定您所配置的模型均可使用。重启本程序或许可以解决这个问题',
            buttons: ['退出']
          })
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LLM_UNAVAILABLE)
          break
        }
      }
    } finally {
      pageMapByName['boss'] = null
      await sleep(rerunInterval)
    }
  }

  process.exit(0)
}

process.once('uncaughtException', (error) => {
  console.error('uncaughtException', error)
  process.exit(1)
})
process.once('unhandledRejection', (error) => {
  console.log('unhandledRejection', error)
  process.exit(1)
})

process.once('disconnect', () => {
  process.exit(0)
})

async function storeStorage(page) {
  const [cookies, localStorage] = await Promise.all([
    page.cookies(),
    page
      .evaluate(() => {
        return JSON.stringify(window.localStorage)
      })
      .then((res) => JSON.parse(res))
  ])
  return Promise.all([
    writeStorageFile('boss-cookies.json', cookies),
    writeStorageFile('boss-local-storage.json', localStorage)
  ])
}
