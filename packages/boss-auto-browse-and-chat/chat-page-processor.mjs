/**
 * 沟通页自动化：处理未读会话 — 对方发来附件简历则下载，对方打招呼则看在线简历后关键词/LLM 筛选，通过则请求附件简历。
 * 所有页面点击均通过 createHumanCursor，使用 sleepWithRandomDelay 做随机延迟。
 */

import { sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import { readConfigFile, getMergedJobConfig } from './runtime-file-utils.mjs'
import { setupNetworkInterceptor, parseGeekInfoFromIntercepted } from './resume-extractor.mjs'
import { createHumanCursor } from './humanMouse.mjs'
import {
  openOnlineResume,
  getOnlineResumeText,
  requestAttachmentResume,
  openPreviewAndDownloadPdf,
  hasIncomingAttachResumeRequest,
  acceptIncomingAttachResume
} from './chat-page-resume.mjs'
import { filterCandidates } from './candidate-processor.mjs'
import { checkIfAlreadyContacted, saveCandidateInfo, logContact } from './data-manager.mjs'
import { setLevel, debug as logDebug, info as logInfo, warn as logWarn } from './logger.mjs'
import {
  BOSS_CHAT_PAGE_URL,
  CHAT_PAGE_ACTIVE_NAME_SELECTOR,
  CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR,
  CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR,
  CHAT_PAGE_ITEM_SELECTOR,
  CHAT_PAGE_ITEM_UNREAD_SELECTOR,
  CHAT_PAGE_ALL_FILTER_SELECTOR,
  CHAT_PAGE_UNREAD_FILTER_SELECTOR,
  CHAT_PAGE_NAME_SELECTOR,
  CHAT_PAGE_JOB_SELECTOR,
  CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR,
  CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR
} from './constant.mjs'

const LOG = '[chat-page-processor]'

/**
 * 在沟通页切换到指定职位。
 * @param {import('puppeteer').Page} page
 * @param {string} jobId
 */
async function switchChatPageJobId (page, jobId) {
  try {
    const cursor = await createHumanCursor(page)
    // 用拟人轨迹点击下拉触发按钮
    const dropdownBtn = await page.$('.ui-dropmenu.chat-top-job .ui-dropmenu-label')
    if (dropdownBtn) {
      const box = await dropdownBtn.boundingBox().catch(() => null)
      if (box) {
        await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      } else {
        await dropdownBtn.click()
      }
    } else {
      await page.click('.ui-dropmenu.chat-top-job .ui-dropmenu-label')
    }
    await page.waitForSelector('.ui-dropmenu.chat-top-job .ui-dropmenu-list', { timeout: 5000 })
    await sleepWithRandomDelay(150, 300)
    // 用拟人轨迹点击目标职位项
    const items = await page.$$('.ui-dropmenu.chat-top-job .ui-dropmenu-list li')
    let found = false
    for (const item of items) {
      const val = await item.evaluate(el => el.getAttribute('value')).catch(() => null)
      if (val === jobId) {
        const itemBox = await item.boundingBox().catch(() => null)
        if (itemBox) {
          await cursor.click({ x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 })
        } else {
          await item.click()
        }
        found = true
        break
      }
    }
    if (!found) {
      logWarn(`${LOG} 职位 ${jobId} 未在沟通页下拉列表中找到，将使用默认职位继续`)
      await page.keyboard.press('Escape')
      return
    }
    // 等待左侧会话列表刷新
    await sleepWithRandomDelay(400, 700)
    logInfo(`${LOG} 已切换到职位 ${jobId}`)
  } catch (e) {
    logWarn(`${LOG} 切换沟通页职位失败（${e.message}），将使用默认职位继续`)
  }
}

/**
 * 从完整简历文本中提取候选人姓名。
 * BOSS 在线简历开头格式：[活跃状态] [姓名] [年龄/简历...]
 * 活跃状态和姓名可能在不同行（y坐标不同），所以必须对全文按任意空白分割，
 * 而不能逐行匹配。第 0 个 token = 活跃状态，第 1 个 token = 姓名。
 * @param {string} text - 完整简历文本（含 \n）
 * @returns {string|null} 识别到的姓名，或 null
 */
function extractNameFromResumeText (text) {
  const tokens = text.trim().split(/\s+/).filter(t => t.length > 0)
  if (tokens.length < 1) return null
  // 情况一：tokens[0] 是活跃状态（含"活跃"），tokens[1] 是姓名
  if (tokens.length >= 2 && /活跃/.test(tokens[0])) {
    return tokens[1]
  }
  // 情况二：无活跃状态前缀，第一个 token 本身是姓名（2-4个汉字，无数字）
  if (/^[\u4e00-\u9fff]{2,4}$/.test(tokens[0])) {
    return tokens[0]
  }
  return null
}

/**
 * 去除 canvas 简历文本开头的字体渲染预热数据。
 * BOSS 在 iframe 首次加载时会把所有 ASCII 可打印字符逐一 fillText 做字形预热（"bzl|abcde..."），
 * 这些数据在 extractResumeText 排序后会出现在真正简历内容之前。
 * 定位到首个含 "活跃" 的行，之前的行全部丢弃。
 * @param {string[]} lines - extractResumeText 返回的行数组
 * @returns {string[]} 去除预热数据后的行数组
 */
function filterFontTestLines (lines) {
  const idx = lines.findIndex(line => line.includes('活跃'))
  if (idx > 0) return lines.slice(idx)
  // 兜底：丢弃不含任何汉字的行
  return lines.filter(line => /[\u4e00-\u9fff]/.test(line))
}

/**
 * 使用 LLM 根据规则筛选简历。
 * 兼容 llm.json 为数组或 { configList } 格式，以及 providerCompleteApiUrl/providerApiSecret 字段名。
 * @param {string} resumeText - 简历全文
 * @param {string} llmRule - 筛选规则描述
 * @returns {Promise<{ pass: boolean, reason: string }>} 出错时默认 pass: true
 */
export async function screenCandidateWithLlm (resumeText, llmRule) {
  const defaultResult = { pass: true, reason: 'LLM 调用失败，默认通过' }
  try {
    const { getEnabledLlmClient } = await import('./llm-rubric.mjs')
    const client = getEnabledLlmClient()
    if (!client) return defaultResult

    const { completes } = await import('@geekgeekrun/utils/gpt-request.mjs')
    const systemContent = `你是一个招聘筛选助手。根据以下筛选规则，判断候选人简历是否符合要求。
筛选规则：${llmRule || '无'}
请仅以JSON格式回复，不要包含其他内容。格式：{"pass": true或false, "reason": "判断理由"}`
    const completion = await completes(
      {
        baseURL: client.baseURL,
        apiKey: client.apiKey,
        model: client.model,
        max_tokens: 200
      },
      [
        { role: 'system', content: systemContent },
        { role: 'user', content: (resumeText || '（无简历内容）').slice(0, 3500) }
      ]
    )
    const raw = completion?.choices?.[0]?.message?.content?.trim()
    if (!raw) return defaultResult
    const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
    const parsed = JSON.parse(jsonStr)
    const pass = !!parsed.pass
    const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
    return { pass, reason }
  } catch (err) {
    logWarn(`${LOG} screenCandidateWithLlm 失败:`, err.message)
    return defaultResult
  }
}

/**
 * 解析沟通页左侧会话列表（仅当前 DOM 可见的项）。
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array<{ encryptGeekId: string, geekName: string, jobTitle: string, unread: boolean, hasAttachmentResumeInChat: boolean }>>}
 */
async function parseConversationList (page) {
  const list = await page.evaluate(
    ({ itemSel, nameSel, jobSel, unreadSel }) => {
      const items = document.querySelectorAll(itemSel)
      const result = []
      items.forEach((node) => {
        const nameEl = node.querySelector(nameSel)
        const jobEl = node.querySelector(jobSel)
        const geekName = nameEl?.textContent?.trim() ?? ''
        const jobTitle = jobEl?.textContent?.trim() ?? ''
        // encryptGeekId is in data-id="<geekId>-0" on the .geek-item element itself
        const dataId = node.getAttribute('data-id') ?? ''
        const encryptGeekId = dataId.replace(/-\d+$/, '')
        // unread: span.badge-count is present only when there are unread messages
        const unread = !!node.querySelector(unreadSel)
        result.push({
          encryptGeekId,
          geekName,
          jobTitle,
          unread,
          hasAttachmentResumeInChat: false
        })
      })
      return result
    },
    {
      itemSel: CHAT_PAGE_ITEM_SELECTOR,
      nameSel: CHAT_PAGE_NAME_SELECTOR,
      jobSel: CHAT_PAGE_JOB_SELECTOR,
      unreadSel: CHAT_PAGE_ITEM_UNREAD_SELECTOR
    }
  )
  return list
}

/**
 * 点击左侧某条会话（通过 encryptGeekId），使右侧显示该会话。使用拟人点击。
 * 若 data-id 找不到（虚拟滚动已卸载），等待短暂后重试一次。
 * @param {import('puppeteer').Page} page
 * @param {string} encryptGeekId - 候选人 ID（对应 .geek-item[data-id="<id>-0"]）
 * @param {{ cursor?: object }} [options]
 * @returns {Promise<boolean>}
 */
async function selectConversationById (page, encryptGeekId, options = {}) {
  const cursor = options.cursor ?? await createHumanCursor(page)
  const selector = `${CHAT_PAGE_ITEM_SELECTOR}[data-id="${encryptGeekId}-0"]`

  let el = await page.$(selector)
  if (!el) {
    // 虚拟滚动可能已将该 item 滚出视口并卸载，尝试滚动列表顶部后重查
    logDebug(`${LOG}   → data-id 未找到，尝试滚回列表顶部后重查...`)
    await page.evaluate((listSel) => {
      const listEl = document.querySelector(listSel)
      if (listEl) listEl.scrollTop = 0
    }, CHAT_PAGE_ITEM_SELECTOR.split(' ')[0])
    await new Promise(r => setTimeout(r, 300))
    el = await page.$(selector)
  }

  if (!el) return false

  // 检查元素是否在会话列表容器的可见区域内；若超出则滚动容器让其进入可见区
  // 注意：元素有 boundingBox 但 Y 坐标可能超出容器裁剪区，点击会打到容器外的其他元素
  const scrolled = await page.evaluate((itemSel, targetId) => {
    const container = document.querySelector('.user-list.b-scroll-stable')
    if (!container) return false
    const item = document.querySelector(`${itemSel}[data-id="${targetId}-0"]`)
    if (!item) return false
    const containerRect = container.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    const isVisible = itemRect.top >= containerRect.top && itemRect.bottom <= containerRect.bottom
    if (!isVisible) {
      item.scrollIntoView({ block: 'nearest' })
      return true
    }
    return false
  }, CHAT_PAGE_ITEM_SELECTOR, encryptGeekId)

  if (scrolled) {
    logDebug(`${LOG}   → 元素超出列表可见区，已滚动至可见`)
    await new Promise(r => setTimeout(r, 300))
    // 重新获取元素引用（scrollIntoView 后 DOM 引用仍有效，但坐标已变）
    el = await page.$(selector)
    if (!el) return false
  }

  const box = await el.boundingBox()
  if (!box) {
    logWarn(`${LOG}   → 滚动后仍无法获取坐标，跳过`)
    return false
  }
  logDebug(`${LOG}   → 找到会话元素，坐标 (${Math.round(box.x + box.width / 2)}, ${Math.round(box.y + box.height / 2)})，执行拟人点击`)
  await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  return true
}

/**
 * 当前右侧会话中，是否存在含"点击预览附件简历"按钮的消息（对方已发来附件）。
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function hasAttachmentResumeInCurrentChat (page) {
  const btn = await page.$(CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR).catch(() => null)
  return !!btn
}


/**
 * 等待 geek/info 数据出现在拦截 Map 中（点击会话后异步到达）
 * @param {() => Map<string, unknown>} peekFn - 不清空的 peek 函数
 * @param {{ timeoutMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<Map<string, unknown> | null>} 超时返回 null
 */
async function waitForGeekInfo (peekFn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000
  const pollMs = opts.pollMs ?? 200
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = peekFn()
    for (const path of snap.keys()) {
      if (path.includes('geek/info')) return snap
    }
    await new Promise(r => setTimeout(r, pollMs))
  }
  return null
}

/**
 * 沟通页自动化主入口。
 * @param {object} hooksFromCaller - 与 startBossAutoBrowse 相同的 hooks（onError, insertCandidateContactLog, createOrUpdateCandidateInfo, queryCandidateByEncryptId 等）
 * @param {{
 *   browser?: import('puppeteer').Browser,
 *   page?: import('puppeteer').Page,
 *   getCapturedText?: Function,
 *   clearCapturedText?: Function,
 *   jobId?: string | null,
 *   retryCandidate?: { encryptGeekId: string, geekName: string, jobTitle: string } | null,
 *   processContext?: { currentCandidate: object | null } | null
 * }} [options]
 * - retryCandidate: 验证中断后需优先重试的候选人（此前已被点击成"已读"，需在「全部」tab 找回）
 * - processContext: 调用方传入的可变对象，本函数在处理每条会话前将 currentCandidate 写入，
 *   供调用方在捕获错误时读取"是哪位候选人被中断"
 */
export default async function startBossChatPageProcess (hooksFromCaller, options = {}) {
  const hooks = hooksFromCaller || {}
  const {
    page: existingPage,
    getCapturedText,
    clearCapturedText,
    jobId = null,
    retryCandidate = null,
    processContext = null
  } = options

  /** @type {import('puppeteer').Page} */
  let page = existingPage
  if (!page) {
    logInfo(`${LOG} 未传入 page，跳过沟通页处理。`)
    return
  }

  const baseConfig = readConfigFile('boss-recruiter.json') || {}
  const config = jobId ? getMergedJobConfig(jobId) : { ...baseConfig, chatPage: baseConfig.chatPage }
  setLevel(config.logLevel || 'info')
  const chatPageConfig = config.chatPage || {}
  if (chatPageConfig.enabled === false) {
    logInfo(`${LOG} 沟通页处理已关闭，跳过。`)
    return
  }

  const maxProcessPerRun = chatPageConfig.maxProcessPerRun ?? 20
  const preFilterConf = chatPageConfig.preFilter || {}
  const filterConf = chatPageConfig.filter || {}
  // 当 BOSS 直聘已配置「接收附件简历自动发到邮箱」时，可将此开关设为 true，
  // 系统将仅发出索取请求，不再打开预览弹窗下载 PDF（webhook resumeFile 字段在此模式下为空）。
  const skipAttachmentResumeDownload = chatPageConfig.attachmentResume?.skipDownload === true
  const mode = filterConf.mode || 'keywords'
  const keywordList = Array.isArray(filterConf.keywordList) ? filterConf.keywordList : []
  const llmRule = typeof filterConf.llmRule === 'string' ? filterConf.llmRule : ''
  const llmConfig = filterConf.llmConfig || null

  const hasPreFilter = Object.keys(preFilterConf).some((k) => {
    const v = preFilterConf[k]
    return Array.isArray(v) ? v.length > 0 : !!v
  })

  logDebug(`${LOG} 配置：maxProcessPerRun=${maxProcessPerRun} mode=${mode} hasPreFilter=${hasPreFilter}`)

  try {
    const onChatPage = page.url().startsWith(BOSS_CHAT_PAGE_URL) || page.url().includes('/web/chat/')
    if (!onChatPage) {
      logInfo(`${LOG} 当前不在沟通页，正在导航...`)
      await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60 * 1000 })
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 120 * 1000 })
      logDebug(`${LOG} 导航完成，当前 URL: ${page.url()}`)
    } else {
      logDebug(`${LOG} 已在沟通页: ${page.url()}`)
    }

    const { getInterceptedData, peekInterceptedData } = setupNetworkInterceptor(page)
    logDebug(`${LOG} 网络拦截器已设置，等待会话列表渲染...`)

    // 等待虚拟滚动列表渲染出至少一条会话 item（readyState='complete' 不够，Vue 组件需额外时间）
    try {
      await page.waitForSelector(CHAT_PAGE_ITEM_SELECTOR, { timeout: 15000 })
      logDebug(`${LOG} 会话列表元素已出现`)
    } catch {
      logWarn(`${LOG} 等待会话列表超时（15s），列表可能为空`)
    }

    // 切换职位（若指定了 jobId 且非全部职位标志）
    if (jobId && jobId !== '-1') {
      await switchChatPageJobId(page, jobId)
    }

    const cursor = await createHumanCursor(page)

    // ────────────────────────────────────────────────────────────────────────────
    // 内部辅助：切换到指定 tab（封闭 page、cursor）
    // ────────────────────────────────────────────────────────────────────────────
    const switchToTab = async (selector, tabName) => {
      const isActive = await page.evaluate(
        (sel) => document.querySelector(sel)?.classList.contains('active') ?? false,
        selector
      )
      if (isActive) {
        logDebug(`${LOG} 已在「${tabName}」tab`)
        return
      }
      logInfo(`${LOG} 切换到「${tabName}」tab...`)
      const tabEl = await page.$(selector)
      if (!tabEl) {
        logWarn(`${LOG} 未找到「${tabName}」tab 元素（selector: ${selector}）`)
        return
      }
      const box = await tabEl.boundingBox().catch(() => null)
      if (box) {
        await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
        await sleepWithRandomDelay(400, 600)
        try {
          await page.waitForSelector(CHAT_PAGE_ITEM_SELECTOR, { timeout: 5000 })
          logDebug(`${LOG} 「${tabName}」tab 切换后列表已刷新`)
        } catch {
          logDebug(`${LOG} 「${tabName}」tab 切换后列表为空（无会话）`)
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // 内部核心：处理单条会话的完整逻辑（闭包，封闭所有外层状态变量）
    // 返回 { processed: boolean, skipped: boolean }
    // ────────────────────────────────────────────────────────────────────────────
    const processOneCandidateConversation = async (item) => {
      const { encryptGeekId, geekName, jobTitle } = item

      // 向调用方暴露当前正在处理的候选人（发生错误时可读取）
      if (processContext) processContext.currentCandidate = item

      const { contacted } = await checkIfAlreadyContacted(encryptGeekId, hooks)
      if (contacted) {
        logInfo(`${LOG}   → 已在数据库中联系过，跳过`)
        if (processContext) processContext.currentCandidate = null
        return { processed: false, skipped: true }
      }
      logDebug(`${LOG}   → 数据库未记录，继续处理`)

      // 切换会话前必须确保在线简历弹窗已关闭。
      // 弹窗遮挡会导致下方会话列表的点击被拦截，使会话无法切换（右侧面板仍显示上一个人），
      // 进而导致打开的在线简历是上一个候选人的数据。
      {
        const resumeCloseBtn = await page.$(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => null)
        if (resumeCloseBtn) {
          logDebug(`${LOG}   → 检测到在线简历弹窗未关闭，点击关闭...`)
          const closeBox = await resumeCloseBtn.boundingBox().catch(() => null)
          if (closeBox) {
            await cursor.click({ x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 })
          } else {
            await resumeCloseBtn.click().catch(() => {})
          }
          try {
            await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR, { hidden: true, timeout: 4000 })
            logDebug(`${LOG}   → 在线简历弹窗已关闭`)
          } catch {
            const stillOpen = await page.$(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => null)
            if (stillOpen) {
              logWarn(`${LOG}   → 在线简历弹窗关闭失败（4s 超时），继续尝试切换会话，但可能影响会话切换成功率`)
            }
          }
        }
      }

      // 点击前先清空拦截数据，确保拿到的是本次点击触发的 geek/info（BOSS 有缓存时可能不重新请求）
      getInterceptedData()
      logDebug(`${LOG}   → 点击会话...`)
      const selected = await selectConversationById(page, encryptGeekId, { cursor })
      if (!selected) {
        logWarn(`${LOG}   → 无法在 DOM 中找到该会话（可能已被标为已读或滚出虚拟滚动视口），跳过`)
        if (processContext) processContext.currentCandidate = null
        return { processed: false, skipped: true }
      }
      logInfo(`${LOG}   → 会话已选中，等待页面加载...`)
      await sleepWithRandomDelay(600, 1200)

      // 验证右侧面板已切换到目标候选人（防止会话点击未生效、面板仍停留在上一人）
      {
        const panelName = await page.$eval(CHAT_PAGE_ACTIVE_NAME_SELECTOR, el => el.textContent?.trim() ?? '').catch(() => '')
        if (panelName && !geekName.includes(panelName) && !panelName.includes(geekName)) {
          logWarn(`${LOG}   → 右侧面板姓名「${panelName}」与期望「${geekName}」不符，会话切换未生效，跳过`)
          await sleepWithRandomDelay(300, 600)
          if (processContext) processContext.currentCandidate = null
          return { processed: false, skipped: true }
        }
        if (panelName) {
          logDebug(`${LOG}   → 右侧面板验证：「${panelName}」✓`)
        }
      }

      // 关闭「意向沟通」提示弹窗（BOSS 每次新浏览器会话打开某些会话时会弹出，遮挡右侧操作按钮）
      {
        const intentKnowBtn = await page.$(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR).catch(() => null)
        if (intentKnowBtn) {
          logInfo(`${LOG}   → 检测到「意向沟通」提示弹窗，点击「我知道了」关闭...`)
          try {
            const knowBox = await intentKnowBtn.boundingBox().catch(() => null)
            if (knowBox) {
              await cursor.click({ x: knowBox.x + knowBox.width / 2, y: knowBox.y + knowBox.height / 2 })
            } else {
              await intentKnowBtn.click().catch(() => {})
            }
          } catch {
            const closeIconEl = await page.$(CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR).catch(() => null)
            if (closeIconEl) {
              const closeIconBox = await closeIconEl.boundingBox().catch(() => null)
              if (closeIconBox) {
                await cursor.click({ x: closeIconBox.x + closeIconBox.width / 2, y: closeIconBox.y + closeIconBox.height / 2 })
              } else {
                await closeIconEl.click().catch(() => {})
              }
            }
          }
          try {
            await page.waitForSelector(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR, { hidden: true, timeout: 3000 })
            logDebug(`${LOG}   → 「意向沟通」弹窗已关闭`)
          } catch {
            logWarn(`${LOG}   → 「意向沟通」弹窗 3s 内未消失，继续执行（可能影响按钮点击）`)
          }
          await sleepWithRandomDelay(200, 400)
        }
      }

      // 阶段一：初步信息筛选（点击会话后 geek/info 已触发，从拦截数据取结构化字段）
      // 注意：使用 peekInterceptedData（不清空）而非 getInterceptedData（清空），避免数据被消费后简历筛选阶段拿不到
      if (hasPreFilter) {
        logDebug(`${LOG}   → 等待 geek/info 数据（初步筛选，最长 5s）...`)
        let geekInfoSnap = await waitForGeekInfo(peekInterceptedData, { timeoutMs: 5000 })
        if (!geekInfoSnap) {
          logWarn(`${LOG}   → geek/info 未到达，重试点击会话...`)
          getInterceptedData()
          const retrySelected = await selectConversationById(page, encryptGeekId, { cursor })
          if (retrySelected) {
            await sleepWithRandomDelay(400, 800)
            geekInfoSnap = await waitForGeekInfo(peekInterceptedData, { timeoutMs: 5000 })
          }
        }
        if (geekInfoSnap) {
          logDebug(`${LOG}   → geek/info 已到达，解析中...`)
          const { data: geekInfoData } = parseGeekInfoFromIntercepted(geekInfoSnap)
          if (geekInfoData) {
            logInfo(`${LOG}   → geek/info 摘要：学历=${geekInfoData.edu} 工龄=${geekInfoData.workYear} 城市=${geekInfoData.city} 薪资=${geekInfoData.salaryDesc ?? geekInfoData.price}`)
            const candidateForFilter = {
              encryptGeekId,
              geekName,
              education: geekInfoData.edu ?? null,
              workExp: geekInfoData.workYear ?? null,
              city: geekInfoData.city ?? null,
              salary: geekInfoData.salaryDesc ?? geekInfoData.price ?? null
            }
            const { skipped } = filterCandidates([candidateForFilter], preFilterConf)
            if (skipped.length > 0) {
              const reason = skipped[0].filterResult.reasonDetail || skipped[0].filterResult.reason
              logInfo(`${LOG}   → 初步信息筛选不通过：${reason}，跳过`)
              await logContact(encryptGeekId, 'resume_screened_out', null, `preFilter:${reason}`, hooks)
              await saveCandidateInfo({ encryptGeekId, geekName, jobTitle, status: 'screened_out' }, hooks)
              getInterceptedData()
              await sleepWithRandomDelay(300, 600)
              if (processContext) processContext.currentCandidate = null
              return { processed: false, skipped: true }
            }
            logInfo(`${LOG}   → 初步信息筛选通过`)
          } else {
            logDebug(`${LOG}   → geek/info 响应无结构化数据（zpData.data 为空），跳过初步筛选`)
          }
        } else {
          logWarn(`${LOG}   → 等待 geek/info 超时（重试后仍未到达），跳过初步筛选`)
        }
      }

      // 检查候选人是否主动发来了附件简历请求（"同意/拒绝"提示），若有则自动同意
      const hasIncoming = await hasIncomingAttachResumeRequest(page)
      if (hasIncoming) {
        logInfo(`${LOG}   → 检测到对方主动发送附件简历请求，自动点击"同意"...`)
        const accepted = await acceptIncomingAttachResume(page, { cursor })
        if (accepted) {
          logInfo(`${LOG}   → 已同意对方发送附件简历`)
          await logContact(encryptGeekId, 'attachment_resume_accepted_incoming', null, 'success', hooks)
        } else {
          logWarn(`${LOG}   → 点击"同意"失败（按钮未找到或不可见）`)
        }
      }

      // 先检查：对方是否已发来附件简历消息（我方此前请求已被对方同意，或上方同意后出现预览按钮）
      const hasAttachment = await hasAttachmentResumeInCurrentChat(page)
      logInfo(`${LOG}   → 附件简历检查：${hasAttachment ? '已有（对方已发来附件）' : '无'}`)

      if (hasAttachment) {
        if (skipAttachmentResumeDownload) {
          logInfo(`${LOG}   → 已有附件简历，但 skipDownload=true（已配置自动发邮箱），跳过 PDF 下载`)
        } else {
          logInfo(`${LOG}   → 下载附件简历...`)
          const { clickedDownload } = await openPreviewAndDownloadPdf(page, null, { cursor })
          if (clickedDownload) {
            logInfo(`${LOG}   → 附件简历下载成功`)
            await logContact(encryptGeekId, 'attachment_resume_downloaded', null, 'success', hooks)
          } else {
            logWarn(`${LOG}   → 附件简历下载失败（未找到下载按钮）`)
          }
        }
        await saveCandidateInfo({ encryptGeekId, geekName, jobTitle, status: 'contacted' }, hooks)
        getInterceptedData()
        await sleepWithRandomDelay(2000, 4000)
        if (processContext) processContext.currentCandidate = null
        return { processed: true, skipped: false }
      }

      // 无附件简历 → 说明对方只是打招呼，需要我方先筛选再决定是否索取
      logInfo(`${LOG}   → 对方打招呼，点击查看在线简历...`)
      if (typeof clearCapturedText === 'function') {
        await clearCapturedText(page)
      }
      const openedResume = await openOnlineResume(page, { cursor, clearCapturedText: clearCapturedText || undefined })
      if (!openedResume) {
        logWarn(`${LOG}   → 未找到「查看在线简历」按钮或 iframe 未出现，跳过`)
        await saveCandidateInfo({ encryptGeekId, geekName, jobTitle, status: 'viewed' }, hooks)
        getInterceptedData()
        await sleepWithRandomDelay(500, 1000)
        if (processContext) processContext.currentCandidate = null
        return { processed: false, skipped: true }
      }
      logInfo(`${LOG}   → 在线简历 iframe 已出现，等待 Canvas 渲染完成...`)
      let resumeText = ''
      if (typeof getCapturedText === 'function') {
        const { extractResumeText } = await import('./resume-extractor.mjs')

        const POLL_INTERVAL_MS = 400
        const STABLE_POLLS_NEEDED = 2
        const CANVAS_POLL_TIMEOUT = 8000
        const canvasDeadline = Date.now() + CANVAS_POLL_TIMEOUT
        let lastCount = -1
        let stableCount = 0
        while (Date.now() < canvasDeadline) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
          const currentCount = await page.evaluate(() => (window.__canvasCapturedText || []).length)
          if (currentCount > 0 && currentCount === lastCount) {
            stableCount++
            if (stableCount >= STABLE_POLLS_NEEDED) break
          } else {
            stableCount = currentCount > 0 ? 1 : 0
          }
          lastCount = currentCount
        }

        const captured = await getCapturedText(page)
        const rawLines = extractResumeText(captured)
        const lines = filterFontTestLines(rawLines)
        resumeText = lines.join('\n')
        logInfo(`${LOG}   → Canvas 抓取完成，共 ${captured.length} 次 fillText 调用，文本 ${resumeText.length} 字（原始行 ${rawLines.length}，过滤后 ${lines.length}）`)

        if (captured.length === 0) {
          logWarn(`${LOG}   → Canvas 为空（等待 ${CANVAS_POLL_TIMEOUT}ms 超时），降级使用 geek/info 摘要...`)
          const out = await getOnlineResumeText(page, { getInterceptedData })
          resumeText = out.text
          logInfo(`${LOG}   → geek/info 摘要文本 ${resumeText.length} 字`)
        } else {
          const detectedName = extractNameFromResumeText(resumeText)
          logDebug(`${LOG}   → 简历姓名识别：${detectedName || '（未识别）'}（期望：${geekName}）`)
          if (!resumeText.includes(geekName)) {
            logWarn(`${LOG}   → [简历不匹配] 期望: ${geekName}，简历检测到: ${detectedName || '（未识别）'}`)
            logWarn(`${LOG}   → 右侧面板未切换到本会话（geek/info 超时或被安全验证打断），跳过，下次运行时重试`)
            getInterceptedData()
            await sleepWithRandomDelay(300, 600)
            if (processContext) processContext.currentCandidate = null
            return { processed: false, skipped: true }
          }
        }
      } else {
        logWarn(`${LOG}   → 无 Canvas hook，从 geek/info 摘要提取...`)
        const out = await getOnlineResumeText(page, { getInterceptedData })
        resumeText = out.text
        logInfo(`${LOG}   → geek/info 摘要文本 ${resumeText.length} 字`)
      }

      if (!resumeText) {
        logWarn(`${LOG}   → 简历文本为空（geek/info 未到达或 zpData.data 无内容）`)
      } else {
        logDebug(`${LOG}   → 简历文本（前200字）：${resumeText.slice(0, 200).replace(/\n/g, ' ')}`)
        logInfo(`${LOG}   → 简历文本获取成功（共 ${resumeText.length} 字）`)
      }

      await sleepWithRandomDelay(2000, 4500)

      let pass = true
      let filterReason = ''

      if (mode === 'keywords') {
        const normalized = (resumeText || '').toLowerCase()
        const hasKeyword = keywordList.length === 0 || keywordList.some((kw) => normalized.includes((kw || '').toLowerCase()))
        pass = hasKeyword
        filterReason = hasKeyword ? '' : `关键词未匹配（列表：${keywordList.join('、')}）`
        logInfo(`${LOG}   → 关键词筛选：${pass ? '通过' : filterReason}`)
      } else if (mode === 'llm') {
        logInfo(`${LOG}   → LLM 筛选中...`)
        let result
        if (llmConfig?.rubric) {
          const { evaluateResumeByRubric } = await import('./llm-rubric.mjs')
          result = await evaluateResumeByRubric(resumeText, {
            knockouts: llmConfig.rubric?.knockouts,
            dimensions: llmConfig.rubric?.dimensions,
            passThreshold: llmConfig.passThreshold ?? 75
          })
          pass = result.isPassed
          filterReason = result.reason || ''
          logInfo(`${LOG}   → LLM Rubric 筛选：${pass ? '通过' : '不通过'}，得分：${result.totalScore}，原因：${filterReason}`)
        } else {
          result = await screenCandidateWithLlm(resumeText, llmRule)
          pass = result.pass
          filterReason = result.reason || ''
          logInfo(`${LOG}   → LLM 筛选：${pass ? '通过' : '不通过'}，原因：${filterReason}`)
        }
      } else {
        logDebug(`${LOG}   → 无筛选模式（mode=${mode}），默认通过`)
      }

      if (pass) {
        logInfo(`${LOG}   → 筛选通过，发送索取附件简历请求...`)
        const openResumeCloseBtn = await page.$(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR).catch(() => null)
        if (openResumeCloseBtn) {
          logDebug(`${LOG}   → 先关闭在线简历弹窗，避免遮挡附件简历按钮...`)
          const closeBox2 = await openResumeCloseBtn.boundingBox().catch(() => null)
          if (closeBox2) {
            await cursor.click({ x: closeBox2.x + closeBox2.width / 2, y: closeBox2.y + closeBox2.height / 2 })
          } else {
            await openResumeCloseBtn.click().catch(() => {})
          }
          try {
            await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR, { hidden: true, timeout: 3000 })
            logDebug(`${LOG}   → 在线简历弹窗已关闭`)
          } catch {
            logWarn(`${LOG}   → 在线简历弹窗关闭超时，继续尝试（可能影响附件简历按钮点击）`)
          }
          await sleepWithRandomDelay(500, 1000)
        }
        const { requested, error } = await requestAttachmentResume(page, { cursor })
        if (requested) {
          logInfo(`${LOG}   → 附件简历索取请求已发送`)
          await logContact(encryptGeekId, 'attachment_resume_requested', null, 'success', hooks)
        } else {
          logWarn(`${LOG}   → 附件简历索取失败：${error}`)
          await logContact(encryptGeekId, 'attachment_resume_requested', null, error || 'failed', hooks)
        }
      } else {
        logInfo(`${LOG}   → 筛选不通过（${filterReason}），跳过`)
        await logContact(encryptGeekId, 'resume_screened_out', null, filterReason || 'screened_out', hooks)
      }

      await saveCandidateInfo(
        {
          encryptGeekId,
          geekName,
          jobTitle,
          status: pass ? 'contacted' : 'screened_out',
          rawData: { resumeText: (resumeText || '').slice(0, 2000) }
        },
        hooks
      )
      getInterceptedData()
      await sleepWithRandomDelay(2000, 4500)
      if (processContext) processContext.currentCandidate = null
      return { processed: true, skipped: false }
    }
    // ────────────────────────────────────────────────────────────────────────────

    // ── 验证恢复：若上次被验证中断，优先重试被中断的候选人 ────────────────────────
    if (retryCandidate) {
      logInfo(`${LOG} ── 验证恢复：重试被中断候选人 ${retryCandidate.geekName}（${retryCandidate.encryptGeekId}）──`)
      // 候选人此前已被点击，状态变为"已读"，需切换到「全部」tab 才能找到
      await switchToTab(CHAT_PAGE_ALL_FILTER_SELECTOR, '全部')
      await sleepWithRandomDelay(300)
      const retrySel = await selectConversationById(page, retryCandidate.encryptGeekId, { cursor })
      if (retrySel) {
        logInfo(`${LOG} 重试候选人会话已找到，开始处理...`)
        await sleepWithRandomDelay(600, 1200)
        await processOneCandidateConversation(retryCandidate)
      } else {
        logWarn(`${LOG} 未在「全部」会话中找到重试候选人 ${retryCandidate.geekName}（可能已被处理或不可见），跳过`)
      }
      // 切回「未读」tab 进行正常扫描
      await switchToTab(CHAT_PAGE_UNREAD_FILTER_SELECTOR, '未读')
      await sleepWithRandomDelay(300)
    }

    // ── 正常扫描：切换到「未读」tab，处理未读会话 ───────────────────────────────
    await switchToTab(CHAT_PAGE_UNREAD_FILTER_SELECTOR, '未读')
    await sleepWithRandomDelay(300)

    const conversations = await parseConversationList(page)
    logDebug(`${LOG} DOM 解析到 ${conversations.length} 条会话`)

    const unreadItems = conversations.filter((c) => c.encryptGeekId)
    const toProcess = unreadItems.slice(0, maxProcessPerRun)
    logInfo(`${LOG} 未读会话 ${unreadItems.length} 条，本次最多处理 ${toProcess.length} 条`)
    if (toProcess.length > 0) {
      logDebug(`${LOG} 候选人列表：${toProcess.map((c, i) => `[${i}] ${c.geekName}(${c.encryptGeekId})`).join(', ')}`)
    }

    await hooks.onProgress?.promise?.({ phase: 'chatPage', current: 0, max: toProcess.length }).catch(() => {})

    let processed = 0

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i]
      logInfo(`${LOG} ── [${i + 1}/${toProcess.length}] 开始处理 ${item.geekName}（${item.encryptGeekId}）──`)
      const result = await processOneCandidateConversation(item)
      if (result.processed) {
        processed++
        await hooks.onProgress?.promise?.({ phase: 'chatPage', current: processed, max: toProcess.length }).catch(() => {})
      }
    }

    logInfo(`${LOG} 本次共处理 ${processed} 条未读会话`)
  } catch (err) {
    await hooks.onError?.promise?.(err)
    throw err
  }
}
