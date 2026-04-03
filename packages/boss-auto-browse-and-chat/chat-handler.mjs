/**
 * 招聘端自动开聊与对话处理
 * 提供：查看候选人详情、发起沟通、单候选人处理流程、每日限额检测
 *
 * 注意：凡在招聘端页面上的点击/移动，均通过 humanMouse.mjs 的拟人轨迹执行，
 * 不直接调用 page.click() / page.mouse.click()，以规避 BOSS 鼠标埋点检测。
 */

import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import { getResumeData, extractResumeText } from './resume-extractor.mjs'
import { createHumanCursor } from './humanMouse.mjs'
import { debug as logDebug, info as logInfo, warn as logWarn } from './logger.mjs'
import {
  CANDIDATE_ITEM_SELECTOR,
  CHAT_START_BUTTON_SELECTOR,
  GREETING_SENT_KNOW_BTN_SELECTOR,
  RESUME_POPUP_CLOSE_SELECTOR,
  NOT_INTERESTED_IN_ITEM_SELECTOR,
  NOT_INTERESTED_REASON_POPUP_SELECTOR,
  NOT_INTERESTED_REASON_ITEMS_SELECTOR,
  NOT_INTERESTED_REASON_MAP,
  NOT_INTERESTED_REASON_POSITION_MISMATCH,
  NOT_INTERESTED_REASON_FALLBACK,
  NOT_INTERESTED_REASON_POPUP_CLOSE_SELECTOR
} from './constant.mjs'

// ---------------------------------------------------------------------------
// 查看候选人详情
// ---------------------------------------------------------------------------

/**
 * 点击候选人条目进入详情，等待详情面板加载，提取详情信息；若详情含 canvas 简历则通过 resume-extractor 获取文字。
 * 选择器为 TODO 占位符，需登录招聘端后通过 DevTools 确认。
 *
 * 点击使用 humanMouse 拟人轨迹，规避 BOSS 鼠标埋点。
 *
 * @param {import('puppeteer').Frame} frame - iframe Frame 实例（候选人列表在此 frame 内）
 * @param {object} candidateItem - 列表中的候选人项，至少含 encryptGeekId、geekName 等
 * @param {{
 *   cursor?: object,
 *   mainPage?: import('puppeteer').Page,
 *   getInterceptedData?: () => Map<string, unknown>,
 *   getCapturedText?: (p: import('puppeteer').Page) => Promise<Array<{text: string, x: number, y: number}>>,
 *   candidateIndex?: number
 * }} [options] - 可选：cursor、mainPage（主页面，用于 Canvas 提取与关闭弹窗）；candidateIndex 为列表中的索引
 * @returns {Promise<object>} 详情数据对象
 */
export async function viewCandidateDetail (frame, candidateItem, options = {}) {
  const { mainPage, getInterceptedData, getCapturedText } = options
  // 推荐牛人页无独立详情面板（CANDIDATE_DETAIL_SELECTOR 为空），不点击卡片（点击会弹出简历弹窗，遮挡列表影响后续打招呼）

  const detail = {
    encryptGeekId: candidateItem.encryptGeekId,
    geekName: candidateItem.geekName,
    education: candidateItem.education,
    workExp: candidateItem.workExp,
    city: candidateItem.city,
    jobTitle: candidateItem.jobTitle,
    salaryExpect: candidateItem.salaryExpect ?? candidateItem.salary,
    skills: candidateItem.skills
  }

  let resumeText = null
  let resumeSource = null

  if (getInterceptedData) {
    const intercepted = getInterceptedData()
    const resumeResult = await getResumeData(frame, intercepted)
    if (resumeResult.source === 'api' && resumeResult.data) {
      resumeSource = 'api'
      resumeText = typeof resumeResult.data === 'string' ? resumeResult.data : JSON.stringify(resumeResult.data)
    } else if (resumeResult.source === 'canvas' && Array.isArray(resumeResult.data)) {
      resumeSource = 'canvas'
      resumeText = resumeResult.data.join('\n')
    }
  } else if (getCapturedText && mainPage) {
    const captured = await getCapturedText(mainPage)
    const lines = extractResumeText(captured)
    if (lines.length > 0) {
      resumeSource = 'canvas'
      resumeText = lines.join('\n')
    }
  }

  if (resumeText) {
    detail.resumeText = resumeText
    detail.resumeSource = resumeSource
  }

  // 关闭简历弹窗（主页面上的 dialog），避免列表一直灰显且便于下一项操作
  if (mainPage && RESUME_POPUP_CLOSE_SELECTOR) {
    try {
      await closeResumePopup(mainPage)
    } catch (e) {
      logWarn('[chat-handler] 关闭简历弹窗失败:', e?.message)
    }
  }

  return detail
}

/**
 * 点击简历详情弹窗的关闭按钮（主页面）
 * @param {import('puppeteer').Page} page - 主页面
 */
export async function closeResumePopup (page) {
  if (!page || !RESUME_POPUP_CLOSE_SELECTOR) return
  const closeBtn = await page.$(RESUME_POPUP_CLOSE_SELECTOR)
  if (!closeBtn) return
  const cursor = await createHumanCursor(page)
  const box = await closeBtn.boundingBox()
  if (box) {
    await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  } else {
    await closeBtn.click()
  }
  await sleepWithRandomDelay(300)
}

/**
 * 在推荐页 iframe 内点击第 itemIndex 条候选人的"不感兴趣"，使该条从列表移除，避免重复扫描。
 * 会先悬停到该卡片再查找按钮；点击后弹出原因弹窗，按筛选原因（filterResult.reason）选对应选项以优化 BOSS 推荐。
 * 后续可接入 LLM：根据 opts.filterResult.reasonDetail 或候选人信息选择更贴切的原因项。
 * @param {import('puppeteer').Frame} frame - recommendFrame
 * @param {number} itemIndex - 在 ul.card-list > li.card-item 中的索引
 * @param {object} [cursor] - 可选拟人 cursor（须为 frame 所在 page 的 cursor，坐标在 page 坐标系）
 * @param {{ logPrefix?: string, filterResult?: { reason: string, reasonDetail?: string } }} [opts] - logPrefix 日志前缀；filterResult 为本条被跳过的筛选结果，用于选对应原因项
 */
export async function clickNotInterested (frame, itemIndex, cursor, opts = {}) {
  const logPrefix = opts.logPrefix || '[chat-handler]'
  const filterResult = opts.filterResult
  const reason = filterResult?.reason || 'unknown'
  if (!NOT_INTERESTED_IN_ITEM_SELECTOR) return
  const items = await frame.$$(CANDIDATE_ITEM_SELECTOR)
  const item = items[itemIndex]
  if (!item) {
    logInfo(logPrefix, '未找到候选人条目（index=', itemIndex, '），跳过点击不感兴趣')
    return
  }
  const page = frame.page?.() || frame
  const c = cursor || await createHumanCursor(page)
  // Puppeteer 24.x boundingBox() 已自动叠加 iframe 偏移，返回 page 绝对坐标，直接使用

  // 第一步：将卡片滚动进视口（卡片可能在视口外，page.mouse 只对可视区域内坐标有效）
  await item.scrollIntoView().catch(() => {})
  await sleepWithRandomDelay(300)

  // 第二步：悬停到卡片中央，触发卡片 hover 样式（使操作区出现）
  const itemBox = await item.boundingBox()
  logDebug(logPrefix, '卡片 boundingBox index=', itemIndex, ':', itemBox)
  if (itemBox) {
    logDebug(logPrefix, '悬停到卡片 index=', itemIndex)
    await c.move({ x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 })
    await sleepWithRandomDelay(400)
  }

  // 第三步：找到 tooltip-wrap 区域并移动过去，触发该区域 hover（"不感兴趣"在此区域内）
  let wrap = await item.$(NOT_INTERESTED_IN_ITEM_SELECTOR)
  let box = wrap ? await wrap.boundingBox() : null
  logDebug(logPrefix, 'tooltip-wrap boundingBox index=', itemIndex, ':', box)
  if (!wrap || !box) {
    logInfo(logPrefix, '未找到不感兴趣按钮或不可见（index=', itemIndex, '），选择器:', NOT_INTERESTED_IN_ITEM_SELECTOR)
    return
  }
  await c.move({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await sleepWithRandomDelay(400)

  // 第四步：再次获取 box 后点击
  box = await wrap.boundingBox()
  if (!box) {
    logInfo(logPrefix, 'tooltip-wrap hover 后仍不可见（index=', itemIndex, '），跳过')
    return
  }
  // 点击前在 frame（iframe）和主页面同时注入 MutationObserver 监听 toast 插入
  // toast 是临时元素（几秒后从 DOM 移除），必须在插入瞬间捕获；toast 可能在 iframe 内或主页面
  const injectToastObserver = (ctx) => ctx.evaluate(() => {
    window.__notInterestedLimitReached = false
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1 && node.classList?.contains('toast')) {
            if (node.innerText?.includes('已达上限')) {
              window.__notInterestedLimitReached = true
            }
            observer.disconnect()
            return
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 3000)
  }).catch(() => {})
  await Promise.all([injectToastObserver(frame), injectToastObserver(page)])

  logDebug(logPrefix, '点击不感兴趣按钮 index=', itemIndex, 'box:', box)
  await c.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await sleep(800)

  // 读取 MutationObserver 结果（frame 或 page 任一检测到即算）
  const limitReachedInFrame = await frame.evaluate(() => window.__notInterestedLimitReached === true).catch(() => false)
  const limitReachedInPage = await page.evaluate(() => window.__notInterestedLimitReached === true).catch(() => false)
  if (limitReachedInFrame || limitReachedInPage) {
    logInfo(logPrefix, '当天标记不合适的牛人数已达上限，停止点击不感兴趣')
    return 'NOT_INTERESTED_LIMIT_REACHED'
  }

  // 点击"不感兴趣"后弹出原因弹窗，按筛选原因选对应选项；弹窗在 iframe 内（与列表同属 recommendFrame）
  if (NOT_INTERESTED_REASON_POPUP_SELECTOR && NOT_INTERESTED_REASON_ITEMS_SELECTOR) {
    const reasonPopupTimeoutMs = 5000
    const runReasonPopup = async () => {
      const popupInFrame = await frame.waitForSelector(NOT_INTERESTED_REASON_POPUP_SELECTOR, { timeout: 2000 }).catch(() => null)
      const popupInPage = !popupInFrame && page !== frame ? await page.waitForSelector(NOT_INTERESTED_REASON_POPUP_SELECTOR, { timeout: 2000 }).catch(() => null) : null
      const popup = popupInFrame || popupInPage
      const ctx = popupInFrame ? frame : page
      if (!popup) {
        if (logPrefix) logInfo(logPrefix, '原因弹窗未出现（index=', itemIndex, '），跳过')
        return
      }
      if (logPrefix) logDebug(logPrefix, '原因弹窗已出现，正在选择原因（', reason, '）…')
      const reasonItems = await ctx.$$(NOT_INTERESTED_REASON_ITEMS_SELECTOR)
      const targetText = NOT_INTERESTED_REASON_MAP[reason] || NOT_INTERESTED_REASON_FALLBACK
      const preferPositionMismatch = (reason === 'skills' || reason === 'blockName') && NOT_INTERESTED_REASON_POSITION_MISMATCH
      let toClick = null
      let matchedText = null
      for (const el of reasonItems) {
        const text = await ctx.evaluate(e => e.textContent.trim(), el).catch(() => '')
        if (preferPositionMismatch && text.includes(NOT_INTERESTED_REASON_POSITION_MISMATCH)) {
          toClick = el
          matchedText = text
          break
        }
        if (text === targetText) {
          toClick = el
          matchedText = text
          break
        }
      }
      if (!toClick && targetText !== NOT_INTERESTED_REASON_FALLBACK) {
        for (const el of reasonItems) {
          const text = await ctx.evaluate(e => e.textContent.trim(), el).catch(() => '')
          if (text === NOT_INTERESTED_REASON_FALLBACK) {
            toClick = el
            matchedText = text
            break
          }
        }
      }
      if (toClick) {
        const reasonBox = await toClick.boundingBox()
        if (reasonBox) {
          await c.click({ x: reasonBox.x + reasonBox.width / 2, y: reasonBox.y + reasonBox.height / 2 })
        } else {
          await toClick.click()
        }
        if (logPrefix && matchedText) {
          logInfo(logPrefix, '不感兴趣原因已选：', matchedText, '（筛选原因：', reason, '）')
        }
      } else {
        // 未匹配到任何选项时点击关闭图标，避免弹窗一直挡住后续操作
        if (NOT_INTERESTED_REASON_POPUP_CLOSE_SELECTOR) {
          const closeBtn = await ctx.$(NOT_INTERESTED_REASON_POPUP_CLOSE_SELECTOR)
          if (closeBtn) {
            const closeBox = await closeBtn.boundingBox()
            if (closeBox) await c.click({ x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 })
            else await closeBtn.click()
            if (logPrefix) logDebug(logPrefix, '未匹配到原因选项，已点击关闭弹窗')
          }
        }
      }
      await sleepWithRandomDelay(300)
    }
    try {
      await Promise.race([
        runReasonPopup(),
        sleep(reasonPopupTimeoutMs).then(() => { throw new Error('原因弹窗处理超时') })
      ])
    } catch (e) {
      logWarn(logPrefix, '不感兴趣原因弹窗处理失败:', e?.message)
    }
  }
}

// ---------------------------------------------------------------------------
// 发起沟通（打招呼 → 知道了 → 继续沟通 → 发消息）
// ---------------------------------------------------------------------------

/**
 * 招聘端打招呼完整流程：
 * 1. 找到并以拟人轨迹点击"打招呼"按钮（CHAT_START_BUTTON_SELECTOR，在当前候选人 item 内）
 * 2. 等待"已向牛人发送招呼"弹窗出现，点击"知道了"（GREETING_SENT_KNOW_BTN_SELECTOR）
 * 3. 等待"继续沟通"按钮出现，在当前候选人 item 内点击（CONTINUE_CHAT_BUTTON_SELECTOR）
 * 4. 等待全局聊天输入框出现（CHAT_INPUT_SELECTOR），输入后续消息（若配置了 greetingMessage）并回车发送
 *
 * 选择器为实际值（已从 HTML 示例中确认）。
 * 所有点击通过 humanMouse 拟人轨迹执行，规避 BOSS 鼠标埋点。
 * 当 options.candidateIndex 存在时，仅在对应 CANDIDATE_ITEM_SELECTOR 的该条内查找按钮，避免点到别的候选人。
 *
 * @param {import('puppeteer').Frame} frame - iframe Frame 实例（候选人列表在此 frame 内）
 * @param {object} candidate - 候选人对象，至少含 encryptGeekId、geekName
 * @param {string} [greetingMessage] - 打招呼后在聊天框发送的后续消息（可选）
 * @param {{ cursor?: object, candidateIndex?: number, mainPage?: import('puppeteer').Page }} [options] - mainPage 为主页面，用于处理弹窗和风控检测
 * @returns {Promise<{ success: boolean, reason: string }>}
 */
export async function startChatWithCandidate (frame, _candidate, _greetingMessage, options = {}) {
  const cursor = options.cursor || await createHumanCursor(frame)
  const candidateIndex = options.candidateIndex
  // mainPage 用于处理主页面弹窗（"知道了" dialog 在主页面，不在 iframe 内）
  const mainPage = options.mainPage || frame

  if (!CHAT_START_BUTTON_SELECTOR) {
    return { success: false, reason: 'CHAT_START_BUTTON_SELECTOR_NOT_CONFIGURED' }
  }

  // 1. 点击"打招呼"按钮（拟人轨迹）；在 iframe frame 内按 candidateIndex 找到对应 item
  // Puppeteer 24.x boundingBox() 已自动叠加 iframe 偏移，返回 page 绝对坐标，直接使用
  try {
    if (typeof candidateIndex === 'number' && CANDIDATE_ITEM_SELECTOR) {
      const items = await frame.$$(CANDIDATE_ITEM_SELECTOR)
      const item = items[candidateIndex]
      if (!item) {
        return { success: false, reason: 'CHAT_BUTTON_NOT_FOUND' }
      }
      const startBtn = await item.$(CHAT_START_BUTTON_SELECTOR)
      if (!startBtn) {
        return { success: false, reason: 'CHAT_BUTTON_NOT_FOUND' }
      }
      const box = await startBtn.boundingBox()
      if (box) {
        await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      } else {
        await startBtn.click()
      }
    } else {
      const startBtn = await frame.waitForSelector(CHAT_START_BUTTON_SELECTOR, { timeout: 8000 })
      if (!startBtn) {
        return { success: false, reason: 'CHAT_BUTTON_NOT_FOUND' }
      }
      const box = await startBtn.boundingBox()
      if (box) {
        await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      } else {
        await startBtn.click()
      }
    }
  } catch {
    return { success: false, reason: 'CHAT_BUTTON_NOT_FOUND' }
  }

  await sleepWithRandomDelay(800)

  // 检测风控或每日限额（在主页面检测，iframe 内不会显示这些提示）
  const immediateCheck = await mainPage.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    if (/今日沟通人数已达上限|明天再来|今日.*已达上限/.test(bodyText)) {
      return 'DAILY_LIMIT_REACHED'
    }
    if (/风控|存在风险|请稍后再试|操作过于频繁/.test(bodyText)) {
      return 'RISK_CONTROL'
    }
    return null
  })
  if (immediateCheck) {
    return { success: false, reason: immediateCheck }
  }

  // 2. 等待"已向牛人发送招呼"弹窗并点击"知道了"（弹窗在主页面，不在 iframe 内）
  if (GREETING_SENT_KNOW_BTN_SELECTOR) {
    try {
      const knowBtn = await mainPage.waitForSelector(GREETING_SENT_KNOW_BTN_SELECTOR, { timeout: 6000 })
      if (knowBtn) {
        const box = await knowBtn.boundingBox()
        if (box) {
          await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
        } else {
          await knowBtn.click()
        }
      }
      await sleepWithRandomDelay(500)
    } catch {
      // 弹窗未出现不是致命错误，继续
      logWarn('[chat-handler] "知道了"弹窗未出现，继续尝试后续步骤')
    }
  }

  // 打招呼已通过点击 button.btn-greet 自动发送，无需继续沟通或发后续消息

  // 最终结果判断：招呼已发成功视为 OK；在 iframe 和主页面同时检测风控/限额文字
  const checkBodyText = (bodyText) => {
    if (/今日沟通人数已达上限|明天再来|今日.*已达上限/.test(bodyText)) {
      return { success: false, reason: 'DAILY_LIMIT_REACHED' }
    }
    if (/风控|存在风险|请稍后再试|操作过于频繁/.test(bodyText)) {
      return { success: false, reason: 'RISK_CONTROL' }
    }
    return null
  }
  const [frameText, pageText] = await Promise.all([
    frame.evaluate(() => document.body?.innerText || '').catch(() => ''),
    mainPage.evaluate(() => document.body?.innerText || '').catch(() => '')
  ])
  const result = checkBodyText(frameText) || checkBodyText(pageText) || { success: true, reason: 'OK' }

  return result
}

// ---------------------------------------------------------------------------
// 单候选人完整流程（详情 + 开聊 + hooks + 延迟）
// ---------------------------------------------------------------------------

/**
 * 整合查看详情与发起沟通的完整流程：beforeStartChat → 开聊 → afterChatStarted，并在开聊后随机延迟。
 * 所有页面点击通过共享的 humanMouse cursor 执行，规避 BOSS 鼠标埋点。
 *
 * @param {import('puppeteer').Frame} frame - iframe Frame 实例（候选人列表在此 frame 内）
 * @param {object} candidate - 候选人对象
 * @param {object} config - 配置，含 autoChat.greetingMessage、autoChat.delayBetweenChats [min, max]
 * @param {object} hooks - tapable hooks：beforeStartChat、afterChatStarted
 * @param {{ getInterceptedData?: () => Map<string, unknown>, getCapturedText?: (p: import('puppeteer').Frame) => Promise<unknown[]>, candidateIndex?: number, mainPage?: import('puppeteer').Page }} [resumeOptions] - 可选，用于 viewCandidateDetail 获取简历；mainPage 为主页面（用于处理弹窗）
 * @returns {Promise<{ detail?: object, chatResult: { success: boolean, reason: string } }>}
 */
export async function processCandidate (frame, candidate, config, hooks, resumeOptions = {}) {
  await hooks.beforeStartChat?.promise?.(candidate)

  const greetingMessage = config?.autoChat?.greetingMessage || ''
  const candidateIndex = resumeOptions.candidateIndex
  const mainPage = resumeOptions.mainPage

  // cursor 必须用 Page 创建（ghost-cursor 内部依赖 page.evaluate 等），不能用 Frame
  const pageForCursor = mainPage || (typeof frame.page === 'function' ? frame.page() : frame)
  const cursor = await createHumanCursor(pageForCursor)

  let detail = null
  try {
    detail = await viewCandidateDetail(frame, candidate, { ...resumeOptions, cursor })
  } catch (err) {
    return {
      detail: null,
      chatResult: { success: false, reason: `VIEW_DETAIL_FAILED: ${err?.message || err}` }
    }
  }

  const chatResult = await startChatWithCandidate(frame, candidate, greetingMessage, { cursor, candidateIndex, mainPage })

  await hooks.afterChatStarted?.promise?.(candidate, chatResult)

  const delayRange = config?.autoChat?.delayBetweenChats
  if (Array.isArray(delayRange) && delayRange.length >= 2) {
    const [minMs, maxMs] = delayRange
    const delay = minMs + Math.random() * (maxMs - minMs)
    await sleep(delay)
  } else {
    await sleepWithRandomDelay(3000)
  }

  return { detail, chatResult }
}

// ---------------------------------------------------------------------------
// 每日开聊限额检测
// ---------------------------------------------------------------------------

/**
 * 检查今日是否已达到开聊上限。通过页面提示语或 DOM 中的限额信息判断。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @returns {Promise<{ limitReached: boolean, count?: number, max?: number }>}
 */
export async function checkDailyLimit (page) {
  const result = await page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    const todayLimitMatch = bodyText.match(/今日已沟通\s*(\d+)\s*\/\s*(\d+)/) ||
      bodyText.match(/今日沟通.*?(\d+).*?(\d+)/) ||
      bodyText.match(/(\d+)\s*\/\s*(\d+)\s*次/)
    if (todayLimitMatch) {
      const count = parseInt(todayLimitMatch[1], 10)
      const max = parseInt(todayLimitMatch[2], 10)
      return { limitReached: count >= max, count, max }
    }
    if (/今日沟通人数已达上限|明天再来|今日.*已达上限/.test(bodyText)) {
      return { limitReached: true }
    }
    return { limitReached: false }
  })
  return result
}
