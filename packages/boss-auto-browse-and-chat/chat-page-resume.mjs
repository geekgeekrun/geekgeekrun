/**
 * 沟通页：先看在线简历 → 提取文字供关键词/LLM 筛选 → 再请求附件简历
 *
 * 在线简历有两套数据（详见 plan/chat_page_resume_flow.md）：
 * - 简单摘要：geek/info、historyMsg body.resume，仅工作单位/学校等，可拦截 API 得到。
 * - 完整版（图片里那种）：加密 → WASM 解密 → 仅画到 #resume Canvas，无明文 API；要完整版需 Canvas hook 或逆向 WASM。
 *
 * 看在线简历无需对方同意；下载 PDF 需先请求附件简历，等对方同意后在新消息里点预览→下载。
 *
 * 所有在招聘端页面上的点击均通过 humanMouse 拟人轨迹执行，规避 BOSS 鼠标埋点。
 */

import { extractResumeText, parseGeekInfoFromIntercepted } from './resume-extractor.mjs'
import { sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import { createHumanCursor } from './humanMouse.mjs'
import {
  CHAT_PAGE_ONLINE_RESUME_SELECTOR,
  CHAT_PAGE_ONLINE_RESUME_IFRAME_SELECTOR,
  CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR,
  CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR,
  CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR,
  CHAT_PAGE_MESSAGE_ITEM_SELECTOR,
  CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR,
  CHAT_PAGE_ACCEPT_ATTACH_RESUME_BTN_SELECTOR,
  CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR,
  CHAT_PAGE_ATTACH_RESUME_DIALOG_CLOSE_SELECTOR,
  CHAT_PAGE_TAB_ALL_SELECTOR,
  CHAT_PAGE_ITEM_SELECTOR,
  CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR,
  CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR
} from './constant.mjs'

/**
 * 点击"查看在线简历"，等待简历内容区域（#resume）出现。
 * 调用前需已选中某条会话（右侧已为该候选人）。
 * 使用拟人轨迹点击，规避 BOSS 鼠标埋点。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {{ timeout?: number, cursor?: object }} [options] - timeout 毫秒；cursor 可选，拟人光标（不传则内部创建）
 * @returns {Promise<boolean>} 是否成功打开并看到 #resume
 */
export async function openOnlineResume (page, options = {}) {
  const timeout = options.timeout ?? 10000
  const cursor = options.cursor ?? await createHumanCursor(page)
  // clearCapturedText 可选传入：关闭旧弹窗后调用，清空旧 iframe 在关闭过程中产生的残留 postMessage
  const clearCapturedText = typeof options.clearCapturedText === 'function' ? options.clearCapturedText : null

  const btn = await page.$(CHAT_PAGE_ONLINE_RESUME_SELECTOR)
  if (!btn) {
    console.log('[openOnlineResume] 未找到在线简历按钮 (selector:', CHAT_PAGE_ONLINE_RESUME_SELECTOR, ')')
    return false
  }

  // 若在线简历弹窗已打开，先关闭它（弹窗不会随切换候选人自动关闭）
  const closeBtn = await page.$(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR)
  if (closeBtn) {
    console.log('[openOnlineResume] 检测到旧简历弹窗，点击关闭按钮...')
    try {
      // 直接用 page.click，比坐标点击更可靠（不受 ghost-cursor 偏移影响）
      await page.click(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR)
    } catch (e) {
      // 备用：坐标点击
      const closeBox = await closeBtn.boundingBox().catch(() => null)
      if (closeBox) {
        await cursor.click({ x: closeBox.x + closeBox.width / 2, y: closeBox.y + closeBox.height / 2 })
      }
    }
    // 等关闭按钮从 DOM 消失（即弹窗完全关闭），比等 iframe 消失更可靠
    try {
      await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_CLOSE_SELECTOR, { hidden: true, timeout: 4000 })
      console.log('[openOnlineResume] 旧简历弹窗已关闭')
    } catch {
      console.log('[openOnlineResume] 关闭按钮 4s 内未消失，继续执行')
    }
    // 关闭期间旧 iframe 可能还会发来残留 postMessage，在点开新简历前清掉
    if (clearCapturedText) {
      await clearCapturedText(page)
      console.log('[openOnlineResume] 旧弹窗关闭后残留 Canvas 数据已清空')
    }
  }

  // 用坐标点击，更可靠
  const box = await btn.boundingBox()
  if (!box) {
    console.log('[openOnlineResume] 在线简历按钮无法获取坐标')
    return false
  }
  console.log('[openOnlineResume] 点击在线简历按钮，坐标:', Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

  try {
    // #resume 在 iframe 内部，主页面 waitForSelector 找不到；改为等待 iframe 本身出现
    await page.waitForSelector(CHAT_PAGE_ONLINE_RESUME_IFRAME_SELECTOR, { timeout })
    console.log('[openOnlineResume] 在线简历 iframe 已出现')
    return true
  } catch {
    console.log('[openOnlineResume] 等待 iframe 超时 (', timeout, 'ms )')
    return false
  }
}

/**
 * 从已拦截的网络数据中取沟通页在线简历（推荐）。
 * 在 openOnlineResume 之前调用 setupNetworkInterceptor(page)，点开在线简历后页面会请求 geek/info，
 * 调用 getInterceptedData() 并传入本函数即可得到与 #resume 上简历内容一致的结构化数据与全文，无需 Canvas hook。
 *
 * @param {() => Map<string, unknown>} getInterceptedData - setupNetworkInterceptor 返回的 getInterceptedData
 * @returns {{ text: string, lines: string[], data: object | null }} data 为 zpData.data，text 为拼接全文，lines 按行数组
 */
export function getOnlineResumeDataFromApi (getInterceptedData) {
  const map = getInterceptedData()
  const { data, text } = parseGeekInfoFromIntercepted(map)
  const lines = text ? text.split('\n').filter(Boolean) : []
  return { text, lines, data }
}

/**
 * 获取在线简历文字，供关键词或 LLM 筛选。
 * 优先用 API：传 getInterceptedData 时从拦截的 geek/info 解析，与页面 #resume 内容一致且不触发反爬。
 * 仅当未传 getInterceptedData 时才用 getCapturedText（需事先 setupCanvasTextHook，可能被反爬检测，不推荐在沟通页使用）。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {{ getInterceptedData?: () => Map<string, unknown>, getCapturedText?: (p: import('puppeteer').Page) => Promise<Array<{text: string, x: number, y: number}>> }} [extractors] - 优先 getInterceptedData（API），否则 getCapturedText（Canvas）
 * @param {{ waitForSelector?: string, paintDelayMs?: number }} [options] - 仅 Canvas 路径使用
 * @returns {Promise<{ text: string, lines: string[], data?: object | null }>}
 */
export async function getOnlineResumeText (page, extractors = {}, options = {}) {
  const { getInterceptedData, getCapturedText } = extractors

  if (typeof getInterceptedData === 'function') {
    const out = getOnlineResumeDataFromApi(getInterceptedData)
    return { text: out.text, lines: out.lines, data: out.data }
  }

  if (typeof getCapturedText === 'function') {
    const contentSelector = options.waitForSelector ?? CHAT_PAGE_ONLINE_RESUME_CONTENT_SELECTOR
    const paintDelayMs = options.paintDelayMs ?? 800
    try {
      await page.waitForSelector(contentSelector, { timeout: 5000 })
    } catch {
      return { text: '', lines: [], data: null }
    }
    await new Promise(r => setTimeout(r, paintDelayMs))
    const captured = await getCapturedText(page)
    const lines = extractResumeText(captured)
    const text = lines.join('\n')
    return { text, lines, data: null }
  }

  return { text: '', lines: [], data: null }
}

/**
 * 点击"附件简历"并在确认弹窗中点击确认（"确定向牛人索取简历吗"）。
 * 调用前需已选中某条会话且已决定向该候选人请求附件。
 * 注意：请求后 PDF 不会立刻到手，需等对方同意，对方同意后会在聊天里发来新消息（异步），
 * 再用 waitForAttachmentResumeMessage 等该条消息出现后，点"点击预览附件简历"→"下载 PDF"。
 * 使用拟人轨迹点击。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {{ confirmTimeout?: number, cursor?: object }} [options] - confirmTimeout 默认 5000；cursor 可选
 * @returns {Promise<{ requested: boolean, error?: string }>}
 */
export async function requestAttachmentResume (page, options = {}) {
  const confirmTimeout = options.confirmTimeout ?? 8000
  const cursor = options.cursor ?? await createHumanCursor(page)

  // 请求前先检测并关闭 tutorial/意向沟通弹窗，避免遮挡附件简历按钮或误点
  const intentKnowBtn = await page.$(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR).catch(() => null)
  if (intentKnowBtn) {
    console.log('[requestAttachmentResume] 检测到意向沟通/tutorial 弹窗，先关闭...')
    try {
      await intentKnowBtn.click()
      await page.waitForSelector(CHAT_PAGE_INTENT_DIALOG_KNOW_BTN_SELECTOR, { hidden: true, timeout: 3000 })
      console.log('[requestAttachmentResume] tutorial 弹窗已关闭')
    } catch {
      const closeIcon = await page.$(CHAT_PAGE_INTENT_DIALOG_CLOSE_SELECTOR).catch(() => null)
      if (closeIcon) await closeIcon.click().catch(() => {})
    }
    await sleepWithRandomDelay(300, 600)
  }

  // 检查是否有残留的确认弹窗（上一个候选人流程遗留，v-if 未关闭）
  // 若存在则先等它消失；若等不到则视为卡死，直接报错，不继续执行
  const staleConfirm = await page.$(CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR).catch(() => null)
  if (staleConfirm) {
    console.log('[requestAttachmentResume] 检测到残留的确认弹窗（上一次遗留），等待其消失（最长 3s）...')
    try {
      await page.waitForSelector(CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR, { hidden: true, timeout: 3000 })
      console.log('[requestAttachmentResume] 残留弹窗已消失，继续')
    } catch {
      console.log('[requestAttachmentResume] 残留弹窗 3s 内未消失，跳过本次请求以避免误操作')
      return { requested: false, error: 'STALE_CONFIRM_DIALOG' }
    }
  }

  // 找到附件简历按钮并用坐标点击
  const attachBtn = await page.$(CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR)
  if (!attachBtn) {
    console.log('[requestAttachmentResume] 未找到附件简历按钮 (selector:', CHAT_PAGE_ATTACH_RESUME_BTN_SELECTOR, ')')
    return { requested: false, error: 'ATTACH_RESUME_BUTTON_NOT_FOUND' }
  }
  const attachBox = await attachBtn.boundingBox()
  if (!attachBox) {
    console.log('[requestAttachmentResume] 附件简历按钮 boundingBox 为空（不在视口或不可见）')
    return { requested: false, error: 'ATTACH_RESUME_BUTTON_NOT_VISIBLE' }
  }
  console.log('[requestAttachmentResume] 点击附件简历按钮，坐标:', Math.round(attachBox.x + attachBox.width / 2), Math.round(attachBox.y + attachBox.height / 2))
  await cursor.click({ x: attachBox.x + attachBox.width / 2, y: attachBox.y + attachBox.height / 2 })
  // 等 Vue 响应点击事件并插入确认弹窗 DOM（v-if）
  await sleepWithRandomDelay(400, 800)

  // 等待确认弹窗出现（v-if 插入 DOM 后即可见）
  try {
    console.log('[requestAttachmentResume] 等待确认弹窗出现（visible:true，最长', confirmTimeout, 'ms）...')
    await page.waitForSelector(CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR, { visible: true, timeout: confirmTimeout })
  } catch (e) {
    console.log('[requestAttachmentResume] 确认弹窗未出现（超时或选择器不匹配）:', e?.message)
    return { requested: false, error: 'CONFIRM_DIALOG_TIMEOUT' }
  }

  // 再次获取确认按钮元素做坐标点击
  const confirmBtn = await page.$(CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR)
  if (!confirmBtn) {
    console.log('[requestAttachmentResume] 确认按钮元素消失（waitForSelector 后立即消失）')
    return { requested: false, error: 'CONFIRM_BTN_DISAPPEARED' }
  }
  const confirmBox = await confirmBtn.boundingBox()
  if (!confirmBox) {
    console.log('[requestAttachmentResume] 确认按钮 boundingBox 为空')
    return { requested: false, error: 'CONFIRM_BTN_NOT_VISIBLE' }
  }
  console.log('[requestAttachmentResume] 点击确认按钮，坐标:', Math.round(confirmBox.x + confirmBox.width / 2), Math.round(confirmBox.y + confirmBox.height / 2))
  await cursor.click({ x: confirmBox.x + confirmBox.width / 2, y: confirmBox.y + confirmBox.height / 2 })
  // 等 Vue 响应点击并移除弹窗 DOM
  await sleepWithRandomDelay(400, 800)

  // 等确认弹窗消失，确认点击已被 Vue 响应（v-if 变 false 移除 DOM）
  try {
    await page.waitForSelector(CHAT_PAGE_ASK_RESUME_CONFIRM_BTN_SELECTOR, { hidden: true, timeout: 3000 })
    console.log('[requestAttachmentResume] 确认弹窗已消失，请求成功')
    return { requested: true }
  } catch {
    console.log('[requestAttachmentResume] 确认弹窗 3s 内未消失（点击未生效或 Vue 未响应），请求视为失败')
    return { requested: false, error: 'CONFIRM_DIALOG_NOT_CLOSED' }
  }
}

/**
 * 检查当前会话是否有候选人主动发来的附件简历请求（"对方想发送附件简历给您，您是否同意"）。
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
export async function hasIncomingAttachResumeRequest (page) {
  const btn = await page.$(CHAT_PAGE_ACCEPT_ATTACH_RESUME_BTN_SELECTOR).catch(() => null)
  return !!btn
}

/**
 * 点击"同意"按钮，接受候选人主动发来的附件简历请求。
 * @param {import('puppeteer').Page} page
 * @param {{ cursor?: object }} [options]
 * @returns {Promise<boolean>} 是否成功点击
 */
export async function acceptIncomingAttachResume (page, options = {}) {
  const cursor = options.cursor ?? await createHumanCursor(page)
  const acceptBtn = await page.$(CHAT_PAGE_ACCEPT_ATTACH_RESUME_BTN_SELECTOR)
  if (!acceptBtn) {
    console.log('[acceptIncomingAttachResume] 未找到"同意"按钮')
    return false
  }
  const box = await acceptBtn.boundingBox()
  if (!box) {
    console.log('[acceptIncomingAttachResume] "同意"按钮 boundingBox 为空')
    return false
  }
  console.log('[acceptIncomingAttachResume] 点击"同意"按钮，坐标:', Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  return true
}

/**
 * 等待聊天中出现"带附件简历"的新消息（对方同意请求后发来的那条，含"点击预览附件简历"）。
 * 请求附件简历是异步的：requestAttachmentResume 只是发出请求，需轮询直到新消息里出现预览按钮。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {{ timeout?: number, pollIntervalMs?: number }} [options] - timeout 总超时（默认 120000），pollIntervalMs 轮询间隔（默认 2000）
 * @returns {Promise<{ found: boolean, element?: import('puppeteer').ElementHandle }>} 若 found 为 true，element 为包含"点击预览附件简历"的那条消息的容器（可在此容器内点预览、再点下载）
 */
export async function waitForAttachmentResumeMessage (page, options = {}) {
  const timeout = options.timeout ?? 120000
  const pollIntervalMs = options.pollIntervalMs ?? 2000
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const msgItems = await page.$$(CHAT_PAGE_MESSAGE_ITEM_SELECTOR)
    for (const el of msgItems) {
      const hasPreview = await el.$(CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR).then(b => !!b).catch(() => false)
      if (hasPreview) {
        return { found: true, element: el }
      }
    }
    await new Promise(r => setTimeout(r, pollIntervalMs))
  }
  return { found: false }
}

/**
 * 在已拿到"带附件简历"的消息容器后，点击"点击预览附件简历"并等待预览弹窗出现，再点击"下载 PDF"。
 * 若需指定下载目录，可在调用前用 page._client.send('Page.setDownloadBehavior', ...) 等设置。
 * 使用拟人轨迹点击（预览按钮在消息容器内，用坐标点击；下载按钮用选择器）。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {import('puppeteer').ElementHandle} [messageElement] - 包含预览按钮的那条消息容器；若不传则在当前对话里找第一条带预览按钮的消息
 * @param {{ previewTimeout?: number, downloadTimeout?: number, cursor?: object }} [options] - cursor 可选
 * @returns {Promise<{ clickedPreview: boolean, clickedDownload: boolean }>}
 */
export async function openPreviewAndDownloadPdf (page, messageElement, options = {}) {
  const previewTimeout = options.previewTimeout ?? 10000
  const cursor = options.cursor ?? await createHumanCursor(page)

  let el = messageElement
  if (!el) {
    const { found, element } = await waitForAttachmentResumeMessage(page, { timeout: 5000 })
    if (!found || !element) return { clickedPreview: false, clickedDownload: false }
    el = element
  }

  const previewBtn = await el.$(CHAT_PAGE_PREVIEW_RESUME_BTN_SELECTOR)
  if (!previewBtn) return { clickedPreview: false, clickedDownload: false }
  // 预览按钮在消息少时会紧贴 tab 栏，拟人轨迹从别处移过来会经过「已交换微信」等 tab，一点就切到空白。
  // 此处直接用 Puppeteer 的 element.click()：无移动轨迹，先 scrollIntoView 再点，避免误触 tab。
  await previewBtn.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
  await sleepWithRandomDelay(150, 300)
  console.log('[openPreviewAndDownloadPdf] 点击「点击预览附件简历」按钮（原生 click，避免轨迹误触 tab）')
  await previewBtn.click()

  // 等待简历预览弹窗内的下载按钮出现（PDF 加载可能较慢，默认 10s）
  let downloadBtn
  try {
    await page.waitForSelector(CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR, { visible: true, timeout: previewTimeout })
    downloadBtn = await page.$(CHAT_PAGE_DOWNLOAD_PDF_BTN_SELECTOR)
  } catch {
    console.log('[openPreviewAndDownloadPdf] 等待下载按钮超时 (', previewTimeout, 'ms)，预览弹窗未出现')
    return { clickedPreview: true, clickedDownload: false }
  }

  if (!downloadBtn) return { clickedPreview: true, clickedDownload: false }
  const downloadBox = await downloadBtn.boundingBox()
  if (!downloadBox) {
    console.log('[openPreviewAndDownloadPdf] 下载按钮 boundingBox 为空')
    return { clickedPreview: true, clickedDownload: false }
  }
  console.log('[openPreviewAndDownloadPdf] 点击下载按钮，坐标:', Math.round(downloadBox.x + downloadBox.width / 2), Math.round(downloadBox.y + downloadBox.height / 2))
  await cursor.click({ x: downloadBox.x + downloadBox.width / 2, y: downloadBox.y + downloadBox.height / 2 })
  // 等待下载开始（给浏览器一点时间触发下载）
  await sleepWithRandomDelay(600, 1000)

  // 关闭简历预览弹窗：优先用 Escape，避免点击关闭时误触下方「已交换微信」等 tab 导致列表切到空分组（暂无牛人）
  const dialogVisible = await page.$(CHAT_PAGE_ATTACH_RESUME_DIALOG_CLOSE_SELECTOR).then(() => true).catch(() => false)
  if (dialogVisible) {
    console.log('[openPreviewAndDownloadPdf] 关闭附件简历预览弹窗（优先 Escape）...')
    await page.keyboard.press('Escape')
    await sleepWithRandomDelay(200, 400)
    const stillVisible = await page.$(CHAT_PAGE_ATTACH_RESUME_DIALOG_CLOSE_SELECTOR).then(() => true).catch(() => false)
    if (stillVisible) {
      const dialogs = await page.$$('.resume-common-dialog').catch(() => [])
      for (const dialog of dialogs) {
        const visible = await dialog.boundingBox().catch(() => null)
        if (!visible) continue
        const closeBtn = await dialog.$('.boss-popup__close').catch(() => null)
        if (closeBtn) {
          await closeBtn.click().catch(() => {})
          break
        }
      }
    }
    await page.waitForSelector(CHAT_PAGE_ATTACH_RESUME_DIALOG_CLOSE_SELECTOR, { hidden: true, timeout: 3000 }).catch(() => {})
  }

  // 若列表被清空（误触到「已交换微信」等 tab），切回「全部」恢复会话列表
  const listCount = await page.$$(CHAT_PAGE_ITEM_SELECTOR).then(arr => arr.length).catch(() => 0)
  if (listCount === 0) {
    const tabAll = await page.$(CHAT_PAGE_TAB_ALL_SELECTOR).catch(() => null)
    if (tabAll) {
      console.log('[openPreviewAndDownloadPdf] 检测到会话列表为空，切回「全部」tab 恢复列表')
      await tabAll.click().catch(() => {})
      await sleepWithRandomDelay(300, 600)
    }
  }

  return { clickedPreview: true, clickedDownload: true }
}
