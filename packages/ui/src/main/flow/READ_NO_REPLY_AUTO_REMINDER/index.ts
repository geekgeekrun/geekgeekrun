import { bootstrap, launchBoss } from './bootstrap'
import { MsgStatus, type ChatListItem } from './types'
import { Browser, Page } from 'puppeteer'
import { sendGptContent, sendLookForwardReplyEmotion } from './boss-operation'
import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import { app, dialog } from 'electron'
import { initDb } from '@geekgeekrun/sqlite-plugin'
import {
  getPublicDbFilePath,
  readConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChatMessageRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatMessageRecord'
import { saveChatMessageRecord } from '@geekgeekrun/sqlite-plugin/dist/handlers'
import { writeStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import * as fs from 'fs'
import { pipeWriteRegardlessError } from '../utils/pipe'
import { BossInfo } from '@geekgeekrun/sqlite-plugin/dist/entity/BossInfo'
import { messageForSaveFilter } from '../../../common/utils/chat-list'
import { RECHAT_CONTENT_SOURCE, RECHAT_LLM_FALLBACK } from '../../../common/enums/auto-start-chat'
import gtag from '../../utils/gtag'

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

const expectJobTypeRegExpStr = readConfigFile('boss.json').expectJobTypeRegExpStr
const onlyRemindBossWithExpectJobType =
  readConfigFile('boss.json').autoReminder?.onlyRemindBossWithExpectJobType ?? !!expectJobTypeRegExpStr

const dbInitPromise = initDb(getPublicDbFilePath())

export const pageMapByName: {
  boss?: Page | null
} = {}

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
    throw new Error('LOGIN_STATUS_INVALID')
  }
  if (
    currentPageUrl.startsWith('https://www.zhipin.com/web/common/403.html') ||
    currentPageUrl.startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
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
      throw new Error('CAPTCHA_PASSED_AND_NEED_RESTART')
    }
  }
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
        (rechatLimitDay && it.updateTime
          ? +new Date() - it.updateTime < rechatLimitDay * 24 * 60 * 60 * 1000
          : true) &&
        ((((it.lastIsSelf && it.lastMsgStatus === MsgStatus.HAS_READ) ||
          canNotConfirmIfHasReadMsgTemplateList.some((regExp) => regExp.test(it.lastText))) &&
          !it.unreadCount) ||
          (!it.lastIsSelf && it.lastText === '开场问题，期待你的回答'))
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
    if (onlyRemindBossWithExpectJobType) {
      const selectedFriendInfo = await pageMapByName.boss?.evaluate(
        `document.querySelector('.chat-conversation')?.__vue__?.selectedFriend$`
      )
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
    if (
      isExpectJobTypeMatch &&
      historyMessageList[historyMessageList.length - 1].isSelf &&
      historyMessageList[historyMessageList.length - 1].status === MsgStatus.HAS_READ &&
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
      if (rechatContentSource === RECHAT_CONTENT_SOURCE.GEMINI_WITH_CHAT_CONTEXT) {
        try {
          const messageListForGpt = historyMessageList
            .filter((it) => it.bizType !== 101 && it.isSelf)
            .slice(-recentMessageQuantityForLlm)
          await sendGptContent(pageMapByName.boss!, messageListForGpt)
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
    } else {
      cursorToContinueFind += 1
    }
    await sleep(1000)
    await saveCurrentChatRecord(pageMapByName.boss!)
    await sleep(3000)
  }
}

let isParentProcessDisconnect = false
process.once('disconnect', () => {
  isParentProcessDisconnect = true
})
const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()

let pipe
try {
  pipe = fs.createWriteStream(null, { fd: 3 })
} catch {
  console.warn('pipe is not available')
}
export async function runEntry() {
  process.on('disconnect', () => {
    app.exit()
  })
  app.dock?.hide()

  while (!isParentProcessDisconnect) {
    try {
      await mainLoop()
    } catch (err) {
      console.error(err)
      try {
        await pageMapByName['boss']?.close()
      } catch {
        //
      }
      // handle error
      if (
        err instanceof Error &&
        ['LOGIN_STATUS_INVALID', 'ACCESS_IS_DENIED', 'ERR_INTERNET_DISCONNECTED'].includes(
          err.message
        )
      ) {
        pipeWriteRegardlessError(
          pipe,
          JSON.stringify({
            type: err.message
          }) + '\r\n'
        )
        process.exit(1)
      }
      if (err instanceof Error && err.message === 'CANNOT_FIND_A_USABLE_MODEL') {
        gtag('cannot_find_a_usable_model')
        await dialog.showMessageBox({
          type: 'error',
          message:
            '未找到可以使用的模型，请确定您所配置的模型均可使用。重启本程序或许可以解决这个问题',
          buttons: ['退出']
        })
        process.exit(0)
        break;
      }
    } finally {
      pageMapByName['boss'] = null
      await sleep(rerunInterval)
    }
  }

  process.exit(0)
}

attachListenerForKillSelfOnParentExited()

process.once('uncaughtException', (error) => {
  console.error('uncaughtException', error)
  process.exit(1)
})
process.once('unhandledRejection', (error) => {
  console.log('unhandledRejection', error)
  process.exit(1)
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
