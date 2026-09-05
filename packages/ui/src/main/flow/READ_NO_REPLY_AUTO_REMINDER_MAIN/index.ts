import { bootstrap, launchBoss } from './bootstrap'
import { MsgStatus, type ChatListItem } from './types'
import { Browser, Page } from 'puppeteer'
import {
  getGptContent,
  sendLookForwardReplyEmotion,
  sendMessage,
  sendResumeViaToolbar,
  requestDynamicDialogueReply,
  sendAgentNotificationEmail
} from './boss-operation'
import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import { waitForPage } from '@geekgeekrun/utils/puppeteer/wait.mjs'
import { app, dialog } from 'electron'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import {
  getPublicDbFilePath,
  readConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChatMessageRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatMessageRecord'
import {
  saveChatMessageRecord,
  getJobHireStatusRecord,
  saveJobHireStatusRecord
} from '@geekgeekrun/sqlite-plugin/dist/handlers'
import {
  writeStorageFile,
  readStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { BossInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/BossInfo'
import { JobInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/JobInfo'
import { messageForSaveFilter } from '../../../common/utils/chat-list'
import {
  AUTO_CHAT_ERROR_EXIT_CODE,
  OPEN_CONTENT_SOURCE,
  RECHAT_CONTENT_SOURCE,
  RECHAT_LLM_FALLBACK
} from '../../../common/enums/auto-start-chat'
import gtag from '../../utils/gtag'
import { JobHireStatus } from '@geekgeekrun/sqlite-plugin/dist/enums'
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

const dynamicChatTurnCountMap = new Map<string, number>()
const handledLastMsgMap = new Map<string, string>()

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
    // 每次扫描实时读取最新配置，确保热生效且避免变量 TDZ
    const bossConf = readConfigFile('boss.json')?.autoReminder || {}
    const enableUnrepliedFollowUp = bossConf.enableUnrepliedFollowUp ?? true
    const enableDynamicChatWithHr = bossConf.enableDynamicChatWithHr ?? true
    const maxDynamicChatTurns = bossConf.maxDynamicChatTurns ?? 10
    const enableLlmSendResumeTool = bossConf.enableLlmSendResumeTool ?? true
    const enableEmailForwardTool = bossConf.enableEmailForwardTool ?? true
    const enableLlmDoNothing = bossConf.enableLlmDoNothing ?? true
    const notifyEmail = process.env.NOTIFY_EMAIL || bossConf.notifyEmail || process.env.SMTP_USER || bossConf.smtpUser || ''
    const emailForwardReplyMessage = bossConf.emailForwardReplyMessage ?? ''

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
      if (index < cursorToContinueFind) {
        return false
      }
      if (
        onlyRemindBossWithoutBlockCompanyName &&
        blockCompanyNameRegExp &&
        blockCompanyNameRegExp.test(it.brandName)
      ) {
        return false
      }
      if (
        rechatLimitDay &&
        it.updateTime &&
        +new Date() - it.updateTime >= rechatLimitDay * 24 * 60 * 60 * 1000
      ) {
        return false
      }

      // 1. 已读不回跟进条件（可开启/关闭）
      const isUnrepliedFollowUp =
        enableUnrepliedFollowUp &&
        ((((it.lastIsSelf &&
          it.lastMsgStatus === MsgStatus.HAS_READ &&
          !it.lastText.includes('你撤回了')) ||
          canNotConfirmIfHasReadMsgTemplateList.some((regExp) => regExp.test(it.lastText))) &&
          !it.unreadCount) ||
          (!it.lastIsSelf && it.lastText === '开场问题，期待你的回答'))

      // 2. HR 回复后动态多轮对话条件（未达10轮上限）
      const currentTurns = dynamicChatTurnCountMap.get(it.encryptBossId) || 0
      const isAlreadyHandled =
        handledLastMsgMap.get(it.encryptBossId) === (it.lastMessageId || it.lastText || String(it.lastTS || '')) &&
        !it.unreadCount
      const isHrReplied =
        enableDynamicChatWithHr &&
        currentTurns < maxDynamicChatTurns &&
        !isAlreadyHandled &&
        ((!it.lastIsSelf && it.lastText !== '开场问题，期待你的回答') || it.unreadCount > 0)

      return isUnrepliedFollowUp || isHrReplied
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
          ; (() => {
            document
              .querySelector('.chat-content .user-list .user-list-content')
              ?.__vue__.scrollToIndex(0)
          })()
        })
        await sleep(10000)
      } else {
        cursorToContinueFind = friendListData.length - 1
        await pageMapByName.boss?.evaluate(() => {
          ; (() => {
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
        ; (() => {
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
    // 获取当前会话头部选中的招聘者与职位元数据
    const selectedFriendInfo = await pageMapByName.boss?.evaluate(
      `document.querySelector('.chat-conversation')?.__vue__?.selectedFriend$`
    )

    // check if expect job type match
    let isExpectJobTypeMatch = true
    if (onlyRemindBossWithExpectJobType) {
      if (!selectedFriendInfo) {
        isExpectJobTypeMatch = false
      } else {
        const jobType = selectedFriendInfo?.positionName
        if (!jobType) {
          isExpectJobTypeMatch = false
        } else {
          const regExp = new RegExp(expectJobTypeRegExpStr)
          isExpectJobTypeMatch = regExp.test(jobType)
        }
      }
    }
    const conversationInfo = await pageMapByName.boss?.evaluate(
      `document.querySelector('.chat-conversation .chat-im.chat-editor')?.__vue__?.conversation$`
    )

    const historyMessageList =
      (
        await pageMapByName.boss?.evaluate(() => {
          return document.querySelector('.message-content .chat-record')?.__vue__?.list$ ?? []
        })
      )?.filter(messageForSaveFilter) ?? []

    const lastGeekMessageSendTime = historyMessageList.findLast((it) => it.isSelf)?.time ?? 0
    const isJobClosed = await checkJobIsClosed()

    const targetBoss = friendListData[toCheckItemAtIndex]
    const lastMsg = historyMessageList[historyMessageList.length - 1]
    const hasHrReplied = historyMessageList.some((it) => !it.isSelf)
    const isLastMessageFromHr = lastMsg && !lastMsg.isSelf
    const currentTurns = dynamicChatTurnCountMap.get(targetBoss.encryptBossId) || 0

    // 已处理会话去重：若此条 HR 消息此前已处理过，跳过重复调用
    const lastMsgKey = targetBoss.lastMessageId || targetBoss.lastText || String(targetBoss.lastTS || '')
    if (
      isLastMessageFromHr &&
      handledLastMsgMap.get(targetBoss.encryptBossId) === lastMsgKey
    ) {
      console.log(`[dynamicChat] 会话 【${targetBoss.name}】 最新消息在上一轮已处理，跳过重复调用`)
      cursorToContinueFind = toCheckItemAtIndex + 1
      continue
    }

    // 从数据库获取岗位原始 JD 信息并直接作为上下文
    const currentEncryptJobId = targetBoss.encryptJobId || conversationInfo?.encryptJobId
    let jobInfoRecord: JobInfo | null = null
    try {
      const ds = await dbInitPromise
      if (currentEncryptJobId && ds) {
        jobInfoRecord = await ds.getRepository(JobInfo).findOne({ where: { encryptJobId: currentEncryptJobId } })
      }
    } catch (e) {
      console.warn('[jobContext] 查询岗位详情异常:', e)
    }

    // 1. 从当前聊天窗口提取头部 DOM 数据（.left-content 中的 .position-name, .salary, .city 等）
    const headerJobDetail = await pageMapByName.boss?.evaluate(() => {
      const leftContentEl =
        document.querySelector('.chat-conversation .left-content') ||
        document.querySelector('#main .chat-conversation [ka="geek_chat_job_detail"] .left-content') ||
        document.querySelector('[ka="geek_chat_job_detail"]')

      let positionFromDom = ''
      let salaryFromDom = ''
      let cityFromDom = ''

      if (leftContentEl) {
        const positionEl = leftContentEl.querySelector('.position-name, .name, .title, .job-title')
        if (positionEl) {
          positionFromDom = (positionEl as HTMLElement).innerText?.trim() || ''
        }

        const salaryEl = leftContentEl.querySelector('.salary, [class*="salary"], .badge-salary, .job-salary, .red')
        if (salaryEl) {
          salaryFromDom = (salaryEl as HTMLElement).innerText?.trim() || ''
        }

        const cityEl = leftContentEl.querySelector('.city, [class*="city"]')
        if (cityEl) {
          cityFromDom = (cityEl as HTMLElement).innerText?.trim() || ''
        }

        // 若直接选择器未命中，使用正则做兜底提取
        const rawText = (leftContentEl as HTMLElement).innerText || ''
        if (!salaryFromDom) {
          const m = rawText.match(/\d+[ \s-–~至]+\d+\s*(?:K|k|元|万|元\/天|元\/月|\/天|\/月)(?:[·*]?\s*\d+薪)?/)
          if (m) salaryFromDom = m[0].trim()
        }
      }

      return {
        positionName: positionFromDom,
        salaryDesc: salaryFromDom,
        cityName: cityFromDom
      }
    })

    // 2. 组装职位背景：先本地 SQLite，再 DOM 提取，最后联系人元数据
    const positionName =
      jobInfoRecord?.positionName ||
      jobInfoRecord?.jobName ||
      headerJobDetail?.positionName ||
      selectedFriendInfo?.positionName ||
      targetBoss.sourceTitle ||
      ''

    const companyName =
      targetBoss.brandName ||
      selectedFriendInfo?.brandName ||
      ''

    let salaryDesc = ''
    if (jobInfoRecord?.salaryLow && jobInfoRecord?.salaryHigh) {
      salaryDesc = `${jobInfoRecord.salaryLow}-${jobInfoRecord.salaryHigh}K${jobInfoRecord.salaryMonth ? `·${jobInfoRecord.salaryMonth}薪` : ''
        }`
    }
    if (!salaryDesc) {
      salaryDesc = headerJobDetail?.salaryDesc || selectedFriendInfo?.salaryDesc || ''
    }

    const cityName =
      jobInfoRecord?.address ||
      headerJobDetail?.cityName ||
      selectedFriendInfo?.cityName ||
      ''

    const degreeName =
      jobInfoRecord?.degreeName ||
      selectedFriendInfo?.degreeName ||
      ''

    const experienceName =
      jobInfoRecord?.experienceName ||
      selectedFriendInfo?.experienceName ||
      ''

    const metaLines = [
      positionName ? `【职位名称】：${positionName}` : '',
      companyName ? `【招聘公司】：${companyName}` : '',
      salaryDesc ? `【薪资待遇】：${salaryDesc}` : '',
      cityName ? `【工作地点】：${cityName}` : '',
      degreeName ? `【要求学历】：${degreeName}` : '',
      experienceName ? `【经验要求】：${experienceName}` : ''
    ].filter(Boolean).join('\n')

    const detailedJd = jobInfoRecord?.description?.trim()
    const jobInfoText = detailedJd
      ? `${metaLines}\n\n【岗位职责与任职要求】：\n${detailedJd}`
      : metaLines

    // 检查是否达到多轮对话上限并记录持久化日志
    if (isLastMessageFromHr && currentTurns >= maxDynamicChatTurns) {
      console.log(
        `[dynamicChat] 会话 【${targetBoss.name} / ${targetBoss.brandName || targetBoss.sourceTitle || ''}】(encryptBossId: ${targetBoss.encryptBossId}) 已达到对话轮数上限 (${maxDynamicChatTurns} 轮)，停止自动回复，转为人工接管。`
      )
      try {
        const logEntry = {
          time: new Date().toISOString(),
          encryptBossId: targetBoss.encryptBossId,
          bossName: targetBoss.name,
          brandName: targetBoss.brandName || targetBoss.sourceTitle || '',
          turns: currentTurns,
          maxTurns: maxDynamicChatTurns,
          message: '达到最大多轮对话上限，转为人工接管'
        }
        const existingLogs = (await readStorageFile('dynamic-chat-turn-limit-logs.json')) || []
        if (Array.isArray(existingLogs)) {
          existingLogs.push(logEntry)
          await writeStorageFile('dynamic-chat-turn-limit-logs.json', existingLogs)
        }
      } catch (e) {
        console.error('[dynamicChat] 写入轮数上限日志失败:', e)
      }
      gtag('dynamic_chat_turn_limit_reached', {
        encryptBossId: targetBoss.encryptBossId,
        turns: currentTurns
      })
    }

    // 分支 1：HR 回复了消息，进行拟人化动态多轮对话（上限 10 轮）
    if (
      !isJobClosed &&
      isExpectJobTypeMatch &&
      enableDynamicChatWithHr &&
      isLastMessageFromHr &&
      currentTurns < maxDynamicChatTurns
    ) {
      console.log(
        `[dynamicChat] 检测到 HR (${targetBoss.name}) 发来新消息，准备拟人多轮回复 (第 ${currentTurns + 1}/${maxDynamicChatTurns} 轮)...`
      )
      // 模拟真人阅读与思考延迟 2s ~ 4s
      await sleepWithRandomDelay(2000, 4000)

      try {
        const replyResult = await requestDynamicDialogueReply(historyMessageList, {
          enableSendResumeTool: enableLlmSendResumeTool,
          enableEmailForwardTool,
          enableDoNothing: enableLlmDoNothing,
          jobInfoText,
          emailForwardReplyMessage
        })

        // 记录当前已处理的消息标识
        handledLastMsgMap.set(targetBoss.encryptBossId, lastMsgKey)

        if (replyResult.action === 'send_resume') {
          console.log(`[dynamicChat] 大模型决定通过工具栏主动发送简历 (原因: ${replyResult.reason})`)
          const sendRes = await sendResumeViaToolbar(pageMapByName.boss!)
          if (sendRes.success) {
            console.log('[dynamicChat] 简历已成功通过工具栏发送')
            await sleepWithRandomDelay(1000, 2000)
            if (replyResult.textToSend) {
              await sendMessage(pageMapByName.boss!, replyResult.textToSend)
            }
            gtag('dynamic_chat_send_resume_executed')
          } else {
            console.warn('[dynamicChat] 工具栏发送简历未成功:', sendRes.error)
            // 发送失败兜底：拦截虚假“已发送”回复，改发缓兵回复并发送邮件报警
            const fallbackReply = '您好，收到您的要求！我稍后在手机端为您发送附件简历，请稍候查阅。'
            await sendMessage(pageMapByName.boss!, fallbackReply)

            const failEmailSubject = `【求职提醒】HR: ${targetBoss.name} 索要简历，自动发送未成功（需手机端手动发送）`
            const failEmailHtml = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 680px; margin: 0 auto; padding: 12px;">
                <div style="background: #fef2f2; border: 1px solid #f87171; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
                  <strong style="color: #b91c1c; font-size: 15px;">⚠️ 自动发简历未成功提醒</strong>
                  <p style="margin: 6px 0 0 0; color: #7f1d1d; font-size: 13px;">HR <strong>${targetBoss.name}</strong> 索要简历，但浏览器自动发送失败（原因: ${sendRes.error || '未检测到简历卡片或触发平台限制'}）。已向 HR 发送缓兵回复，请尽快在手机 BOSS 直聘 APP 上手动点击发送附件简历！</p>
                </div>
              </div>
            `
            sendAgentNotificationEmail({
              to: notifyEmail,
              subject: failEmailSubject,
              html: failEmailHtml
            }).catch((err) => console.error('[dynamicChat] 简历失败报警邮件发送异常:', err))
          }
        } else if (replyResult.action === 'send_email') {
          console.log(`[dynamicChat] 大模型决定调用邮件工具转告候选人 (原因: ${replyResult.reason})`)
          if (replyResult.textToSend?.trim()) {
            await sendMessage(pageMapByName.boss!, replyResult.textToSend)
          } else {
            console.log(`[dynamicChat] 转告邮件同时回复 HR 话术未配置或留空，仅在后台静默发送邮件通知本人`)
          }
          gtag('dynamic_chat_email_forward_sent')

          const company = targetBoss.brandName || targetBoss.sourceTitle || '招聘方'
          const reasonText = replyResult.reason || '提出了新要求'
          const emailSubject = `【${company}】${reasonText}`

          const recentChatHtml = historyMessageList.slice(-10).map((it) => {
            const isSys = (it as any).isSystem || it.messageType === 'dialog' || it.messageType === 'system'
            const sender = isSys ? '【系统卡片】' : (it.isSelf ? '【候选人/Agent】' : `【HR ${targetBoss.name}】`)
            const bg = isSys ? '#fffbeb' : (it.isSelf ? '#f0f9ff' : '#f8f9fa')
            const color = isSys ? '#b45309' : (it.isSelf ? '#0284c7' : '#334155')
            return `<div style="background:${bg};padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:13px;"><strong style="color:${color};">${sender}：</strong>${(it.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
          }).join('')

          const jdHtml = jobInfoText?.trim()
            ? `<div style="margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 6px; padding: 12px 16px;">
                <div style="font-weight: bold; font-size: 14px; color: #1e40af; margin-bottom: 8px;">📄 岗位职责与任职要求 (JD)</div>
                <div style="white-space: pre-wrap; font-size: 13px; color: #334155; line-height: 1.6; word-break: break-word;">${jobInfoText.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
              </div>`
            : ''

          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 680px; margin: 0 auto; padding: 16px; background: #ffffff;">
              <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 0;">📌 招聘者与岗位信息</h3>
              <ul style="padding-left: 20px; margin: 8px 0; font-size: 13.5px;">
                <li><strong>招聘者：</strong>${targetBoss.name} (${targetBoss.sourceTitle || 'HR'})</li>
                <li><strong>公司：</strong>${company}</li>
                <li><strong>触发原因：</strong>${reasonText}</li>
                <li><strong>已回复 HR：</strong>${replyResult.textToSend?.trim() ? replyResult.textToSend : '（未配置回复 HR，仅在后台静默邮件通知本人）'}</li>
              </ul>

              <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 20px;">💬 对话历史记录</h3>
              <div style="margin-top: 10px;">
                ${recentChatHtml}
              </div>

              ${jdHtml}
            </div>
          `

          sendAgentNotificationEmail({
            to: notifyEmail,
            subject: emailSubject,
            html: emailHtml
          }).catch((err) => console.error('[dynamicChat] 邮件发送异常:', err))
        } else if (replyResult.action === 'do_nothing' || !replyResult.textToSend?.trim()) {
          console.log(`[dynamicChat] 大模型判断无需回复 HR (${targetBoss.name})，保持静默`)
        } else {
          console.log(`[dynamicChat] 发送拟人文本回复: ${replyResult.textToSend}`)
          await sendMessage(pageMapByName.boss!, replyResult.textToSend)
          gtag('dynamic_chat_text_sent')
        }

        dynamicChatTurnCountMap.set(targetBoss.encryptBossId, currentTurns + 1)
      } catch (err: any) {
        console.error('[dynamicChat] 动态回复异常:', err)
      }
    }
    // 分支 2：HR 已读不回，进行自动跟进（需在 enableUnrepliedFollowUp 开启时才执行）
    else if (
      enableUnrepliedFollowUp &&
      !isJobClosed &&
      isExpectJobTypeMatch &&
      lastMsg &&
      lastMsg.isSelf &&
      lastMsg.status === MsgStatus.HAS_READ &&
      ((conversationInfo &&
        Object.hasOwn(conversationInfo, 'bothTalked') &&
        !conversationInfo.bothTalked) ||
        !hasHrReplied) &&
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
            const textToSend = await getGptContent(messageList, jobInfoText)
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
            const textToSend = await getGptContent(messageList, jobInfoText)
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
    }
    cursorToContinueFind = toCheckItemAtIndex + 1
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
