import { sleep, sleepWithRandomDelay } from '../../../../utils/sleep.mjs'
import { consumeApprovedAutoReply, handleLatestHrMessage } from './flow.mjs'

export const MsgStatus = Object.freeze({ BOSS_MESSAGE_OR_SYSTEM_MESSAGE: 0, HAS_NOT_READ: 1, HAS_READ: 2, HAS_REVOKE: 3 })
const question = /[?？吗么呢]|简历|介绍|方便|沟通|薪资|面试|到岗|电话|微信|邮箱|项目|经历|学历|证书|外包|驻场|加班|出差|离职/
const uncertainReadTemplates = ['Boss还没查看你的消息', '你与该职位竞争者PK情况', '简历诊断提醒', '附件简历还没准备好', '设置合适的期望薪资范围']

export function cookieListIsValid(cookies) {
  const required = ['name', 'value', 'domain', 'path', 'secure', 'session', 'httpOnly']
  return Boolean(Array.isArray(cookies) && cookies.length && cookies.every((cookie) => required.every((key) => Object.hasOwn(cookie, key))))
}

export function resolveBlockedCompanyPattern(bossSettings, commonSettings) {
  return (bossSettings.fieldsForUseCommonConfig?.blockCompanyNameRegExpStr ? commonSettings?.blockCompanyNameRegExpStr : bossSettings.blockCompanyNameRegExpStr) ?? ''
}

export function responseMatchesChat(response, item) {
  if (!response?.url?.().startsWith('https://www.zhipin.com/wapi/zpchat/geek/historyMsg')) return false
  const payload = `${response.url()}\n${response.request?.().postData?.() ?? ''}`
  const identities = [item.friendId, item.encryptJobId, item.encryptBossId, item.securityId].filter((value) => value !== undefined && value !== null && String(value))
  return identities.some((identity) => payload.includes(encodeURIComponent(String(identity))) || payload.includes(String(identity)))
}

export function selectedChatMatches(selected, item, conversation) {
  if (!selected || !conversation) return false
  const equal = (left, right) => String(left) === String(right)
  if (item.friendId !== undefined && !equal(selected.friendId, item.friendId)) return false
  if (item.encryptBossId && !equal(selected.encryptBossId, item.encryptBossId)) return false
  if (item.encryptJobId) {
    const ids = [selected.encryptJobId, conversation.encryptJobId].filter(Boolean)
    if (!ids.length || ids.some((id) => !equal(id, item.encryptJobId))) return false
  }
  return true
}

export function canSendSelfReminder({ conversation, history, isJobClosed, isExpectedJob }) {
  const hasBothTalked = Object.hasOwn(conversation ?? {}, 'bothTalked')
  const noReply = hasBothTalked ? !conversation.bothTalked : !history.some((message) => !message.isSelf)
  return !isJobClosed && isExpectedJob && noReply
}

export function nextTraversalAction(finished, loadedCount) {
  return finished ? { cursor: 0, toTop: true, delayMs: 10000 } : { cursor: Math.max(0, loadedCount - 1), toTop: false, delayMs: 3000 }
}

export async function selectChatSafely({ page, target, handle, timeout = 15000, pause = sleepWithRandomDelay }) {
  const response = page.waitForResponse((candidate) => responseMatchesChat(candidate, target), { timeout })
  await handle.click()
  try { await response } catch { return null }
  await pause(1000)
  const selected = await page.evaluate(`document.querySelector('.chat-conversation')?.__vue__?.selectedFriend$`)
  const conversation = await page.evaluate(`document.querySelector('.chat-conversation .chat-im.chat-editor')?.__vue__?.conversation$`)
  if (!selectedChatMatches(selected, target, conversation)) return null
  const history = await page.evaluate(`document.querySelector('.message-content .chat-record')?.__vue__?.list$ ?? []`)
  return { selected, conversation, history }
}

export async function handleSelfReminder({ reminder, history, operations }) {
  const sent = history.filter((item) => item.isSelf && item.bizType !== 101).slice(-(reminder.recentMessageQuantityForLlm ?? 8))
  if (!sent.length && (reminder.openContentSource ?? 1) === 1) {
    await operations.sendMessage(reminder.constantOpenContent || '您好，我对贵公司岗位很感兴趣，希望能有机会进一步沟通，期待您的回复')
  } else if (!sent.length || reminder.rechatContentSource === 2) {
    try { await operations.sendMessage(await operations.requestReviewDraft(sent)) }
    catch (error) {
      if (sent.length && reminder.rechatLlmFallback !== 1) throw error
      if (sent.length) await operations.sendEmotion()
      else await operations.sendMessage(reminder.constantOpenContent || '您好，我对贵公司岗位很感兴趣，希望能有机会进一步沟通，期待您的回复')
    }
  } else await operations.sendEmotion()
}

export function shouldInspectChat(item, settings, now = Date.now()) {
  const reminder = settings.autoReminder ?? {}
  if (reminder.rechatLimitDay && item.updateTime && now - item.updateTime >= reminder.rechatLimitDay * 86400000) return false
  const blocked = resolveBlockedCompanyPattern(settings, settings.commonJobCondition)
  if (reminder.onlyRemindBossWithoutBlockCompanyName && blocked) { try { if (new RegExp(blocked, 'im').test(item.brandName)) return false } catch {} }
  return Boolean(((((item.lastIsSelf && item.lastMsgStatus === MsgStatus.HAS_READ && !item.lastText?.includes('你撤回了')) || uncertainReadTemplates.some((text) => item.lastText?.includes(text))) && !item.unreadCount)) ||
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

export async function processConversations({ page, database, settings, shouldStop, approval, taskReporter, operations = {} }) {
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
    if (index < 0) {
      const finished = await page.evaluate(`(document.querySelector('.main-wrap .chat-user .user-list-content div[role=tfoot] .finished')?.textContent ?? '').includes('没有')`)
      const next = nextTraversalAction(finished, friends.length)
      cursor = next.cursor
      await page.evaluate((toTop) => {
        const list = document.querySelector('.chat-content .user-list .user-list-content')?.__vue__
        if (toTop) list?.scrollToIndex(0); else list?.scrollToBottom()
      }, next.toTop)
      await (operations.sleep ?? sleep)(next.delayMs)
      continue
    }
    cursor = index + 1
    await page.evaluate((position) => document.querySelector('.chat-content .user-list .user-list-content')?.__vue__?.scrollToIndex(position), index)
    await sleep(1000)
    const target = friends[index]
    const handle = (await page.evaluateHandle((jobId) => [...document.querySelectorAll('.main-wrap .chat-user li[role=listitem]')].find((item) => item.__vue__.source.encryptJobId === jobId), target.encryptJobId)).asElement()
    if (!handle) continue
    const current = await selectChatSafely({ page, target, handle, timeout: operations.historyTimeoutMs ?? 15000, pause: operations.pause })
    if (!current) continue
    const { selected, conversation, history } = current
    const latestMessage = history.at(-1)
    const context = { hrName: selected?.bossName ?? selected?.name ?? conversation?.bossName ?? '', company: selected?.brandName ?? conversation?.brandName ?? '', jobTitle: selected?.positionName ?? conversation?.positionName ?? '', userName: settings.userName ?? 'Toby' }
    const expectedPattern = settings.fieldsForUseCommonConfig?.jobDetail ? settings.commonJobCondition?.expectJobTypeRegExpStr : settings.expectJobTypeRegExpStr
    const isExpectedJob = !(settings.autoReminder?.onlyRemindBossWithExpectJobType ?? Boolean(expectedPattern)) || Boolean(selected?.positionName && new RegExp(expectedPattern).test(selected.positionName))
    const isJobClosed = await operations.checkJobIsClosed?.({ page, database, conversation, selected }) ?? false
    if (latestMessage?.isSelf && latestMessage.status === MsgStatus.HAS_READ && canSendSelfReminder({ conversation, history, isJobClosed, isExpectedJob })) {
      const reminder = settings.autoReminder ?? {}
      const elapsed = Date.now() - Number(latestMessage.time ?? 0)
      if (elapsed >= (reminder.throttleIntervalMinutes ?? 10) * 60000) {
        await handleSelfReminder({ reminder, history, operations: ops })
      }
    } else if (!isJobClosed && isExpectedJob && !await consumeApprovedAutoReply({ latestMessage, context, operations: ops })) {
      const result = await handleLatestHrMessage({ latestMessage, historyMessages: history.slice(-(settings.autoReminder?.recentMessageQuantityForLlm ?? 8)), context, policy: settings.agentReplyPolicy, operations: ops })
      taskReporter.emit('task.progress', { workerId: 'readNoReplyAutoReminderMain', state: result.action })
    }
    await operations.saveCurrentChatRecords?.(page)
  }
}
