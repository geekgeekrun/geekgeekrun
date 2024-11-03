import { bootstrap, launchBoss } from './bootstrap'
import { MsgStatus, type ChatListItem } from './types'
import { Page } from 'puppeteer'
import { sendLookForwardReplyEmotion } from './boss-operation'
import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'

export const pageMapByName: {
  boss?: Page | null
} = {}

export const runEntry = async () => {
  try {
    const canNotConfirmIfHasReadMsgTemplateList = [
      'Boss还没查看你的消息',
      '你与该职位竞争者PK情况',
      '简历诊断提醒',
      '附件简历还没准备好',
      '开场问题，期待你的回答'
    ].map((it) => new RegExp(it))
    const browser = await bootstrap()
    await Promise.all([launchBoss(browser)])

    await sleep(1000)
    pageMapByName.boss!.bringToFront()
    await sleep(2000)

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
      // find target boss - with unread icon, or recommend system message
      const friendListData = (await pageMapByName.boss!.evaluate(
        `
        document.querySelector('.main-wrap .chat-user')?.__vue__?.list
      `
      )) as Array<ChatListItem>
      const toCheckItemAtIndex = friendListData.findIndex(
        (it, index) =>
          index >= cursorToContinueFind &&
          ((it.lastIsSelf && it.lastMsgStatus === MsgStatus.HAS_READ) ||
            canNotConfirmIfHasReadMsgTemplateList.some((regExp) => regExp.test(it.lastText))) &&
          !it.unreadCount
      )

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
      const bossInfo = await pageMapByName.boss?.evaluate(() => {
        return document.querySelector('.chat-conversation')?.__vue__['bossInfo$']
      })

      const historyMessageList =
        (
          await pageMapByName.boss?.evaluate(() => {
            return (
              document.querySelector('.main-wrap .chat-conversation .chat-record')?.__vue__
                ?.records$ ?? []
            )
          })
        )?.filter((msg) => ['received', 'sent'].includes(msg.style)) ?? []

      const lastGeekMessageSendTime =
        historyMessageList.findLast((it) => it.style === 'sent')?.time ?? 0
      if (
        historyMessageList[historyMessageList.length - 1].style === 'sent' &&
        historyMessageList[historyMessageList.length - 1].status === MsgStatus.HAS_READ &&
        (!bossInfo.bothTalked ||
          !historyMessageList.filter((it) => it.style === 'received').length) &&
        // don't disturb too much
        Date.now() - lastGeekMessageSendTime >= 8 * 60 * 60 * 1000
      ) {
        await sleepWithRandomDelay(3250)
        await sendLookForwardReplyEmotion(pageMapByName.boss!)
      } else {
        cursorToContinueFind += 1
      }
      await sleep(3000)
    }
  } catch (err) {
    console.error(err)
  }
}

attachListenerForKillSelfOnParentExited()
