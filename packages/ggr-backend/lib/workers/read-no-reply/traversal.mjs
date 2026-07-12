import { sleep, sleepWithRandomDelay } from '../../../../utils/sleep.mjs'
import { consumeApprovedAutoReply, handleLatestHrMessage } from './flow.mjs'

export const MsgStatus = Object.freeze({ BOSS_MESSAGE_OR_SYSTEM_MESSAGE: 0, HAS_NOT_READ: 1, HAS_READ: 2, HAS_REVOKE: 3 })
const question = /[?？吗么呢]|简历|介绍|方便|沟通|薪资|面试|到岗|电话|微信|邮箱|项目|经历|学历|证书|外包|驻场|加班|出差|离职/

export function shouldInspectChat(item, settings, now = Date.now()) {
  const reminder = settings.autoReminder ?? {}
  if (reminder.rechatLimitDay && item.updateTime && now - item.updateTime >= reminder.rechatLimitDay * 86400000) return false
  const blocked = settings.commonJobCondition?.blockCompanyNameRegExpStr
  if (reminder.onlyRemindBossWithoutBlockCompanyName && blocked) { try { if (new RegExp(blocked, 'im').test(item.brandName)) return false } catch {} }
  return Boolean((((item.lastIsSelf && item.lastMsgStatus === MsgStatus.HAS_READ && !item.lastText?.includes('你撤回了')) && !item.unreadCount)) ||
    (!item.lastIsSelf && item.lastText === '开场问题，期待你的回答') ||
    (!item.lastIsSelf && item.lastText?.trim() && !item.lastText.includes('你撤回了') && (item.unreadCount || question.test(item.lastText))))
}

async function sendText(page, text) {
  const input = await page.$('.chat-conversation .message-controls .chat-input')
  if (!input) throw new Error('chat input is unavailable')
  await input.click(); await input.type(text, { delay: 50 })
  await page.click('.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)')
}

async function sendEmotion(page) {
  await (await page.$('.chat-conversation .message-controls .btn-emotion'))?.click()
  await sleepWithRandomDelay(1000)
  await (await page.$('.chat-conversation .message-controls .emotion .emotion-tab .emotion-sort:nth-child(3)'))?.click()
  await sleepWithRandomDelay(1500)
  await (await page.$('.chat-conversation .message-controls .emotion .emotion-box img[title=盼回复]'))?.click()
}

export async function processConversations({ page, settings, shouldStop, approval, taskReporter, operations = {} }) {
  const ops = {
    sendMessage: operations.sendMessage ?? ((text) => sendText(page, text)),
    sendEmotion: operations.sendEmotion ?? (() => sendEmotion(page)),
    requestReviewDraft: operations.requestReviewDraft ?? (async () => ''),
    appendApprovalRequest: approval.appendApprovalRequest,
    listApprovals: approval.listApprovals,
    markApproval: approval.markApproval
  }
  let cursor = 0
  while (!(await shouldStop())) {
    await page.waitForFunction(() => Array.isArray(document.querySelector('.main-wrap .chat-user')?.__vue__?.list))
    const friends = await page.evaluate(`document.querySelector('.main-wrap .chat-user')?.__vue__?.list ?? []`)
    const index = friends.findIndex((item, position) => position >= cursor && shouldInspectChat(item, settings))
    if (index < 0) return
    cursor = index + 1
    await page.evaluate((position) => document.querySelector('.chat-content .user-list .user-list-content')?.__vue__?.scrollToIndex(position), index)
    await sleep(1000)
    const handle = (await page.evaluateHandle((jobId) => [...document.querySelectorAll('.main-wrap .chat-user li[role=listitem]')].find((item) => item.__vue__.source.encryptJobId === jobId), friends[index].encryptJobId)).asElement()
    await handle?.click()
    await sleepWithRandomDelay(1000)
    const selected = await page.evaluate(`document.querySelector('.chat-conversation')?.__vue__?.selectedFriend$`)
    const conversation = await page.evaluate(`document.querySelector('.chat-conversation .chat-im.chat-editor')?.__vue__?.conversation$`)
    const history = await page.evaluate(`document.querySelector('.message-content .chat-record')?.__vue__?.list$ ?? []`)
    const latestMessage = history.at(-1)
    const context = { hrName: selected?.bossName ?? selected?.name ?? conversation?.bossName ?? '', company: selected?.brandName ?? conversation?.brandName ?? '', jobTitle: selected?.positionName ?? conversation?.positionName ?? '', userName: settings.userName ?? 'Toby' }
    if (latestMessage?.isSelf && latestMessage.status === MsgStatus.HAS_READ) {
      const reminder = settings.autoReminder ?? {}
      const sent = history.filter((item) => item.isSelf && item.bizType !== 101).slice(-(reminder.recentMessageQuantityForLlm ?? 8))
      const elapsed = Date.now() - Number(latestMessage.time ?? 0)
      if (elapsed >= (reminder.throttleIntervalMinutes ?? 10) * 60000) {
        if (!sent.length || reminder.rechatContentSource === 2) {
          try { await ops.sendMessage(await ops.requestReviewDraft(sent)) }
          catch (error) {
            if (sent.length && reminder.rechatLlmFallback !== 1) throw error
            if (sent.length) await ops.sendEmotion()
            else await ops.sendMessage(reminder.constantOpenContent || '您好，我对贵公司岗位很感兴趣，希望能有机会进一步沟通，期待您的回复')
          }
        } else await ops.sendEmotion()
      }
    } else if (!await consumeApprovedAutoReply({ latestMessage, context, operations: ops })) {
      const result = await handleLatestHrMessage({ latestMessage, historyMessages: history.slice(-(settings.autoReminder?.recentMessageQuantityForLlm ?? 8)), context, policy: settings.agentReplyPolicy, operations: ops })
      taskReporter.emit('task.progress', { workerId: 'readNoReplyAutoReminderMain', state: result.action })
    }
    await operations.saveCurrentChatRecords?.(page)
  }
}
