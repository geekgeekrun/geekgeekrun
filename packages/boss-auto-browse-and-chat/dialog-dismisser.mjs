/**
 * 通用弹窗 / 遮挡层自动识别与关闭。
 *
 * 设计目标：减少手动维护「治理公告」「意向沟通」之类一次性弹窗 selector 的成本。
 * 思路：
 * 1) 启发式扫描页面顶层 fixed / 高 z-index 浮层；
 * 2) 在浮层内按文本（我已知晓/我知道了/知道了/确定/好的/关闭/取消/跳过/×）+
 *    aria-label / class（close|dismiss|confirm-btn|btn-sure）匹配关闭按钮；
 * 3) safeClickAt：点击前用 elementFromPoint 检测目标坐标是否被遮挡，被挡则先尝试关闭遮挡再重试。
 *
 * 注意：所有浏览器侧逻辑都在一次 evaluate 内做完，避免多次 round-trip；返回结果含被关闭浮层的 outerHTML 摘要供日志审计。
 */

import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { debug as logDebug, info as logInfo } from './logger.mjs'

/** 关闭按钮文本（按优先级） */
const CLOSE_TEXTS = [
  '我已知晓', '我知道啦', '我知道了', '知道了', '我知道',
  '好的', '确定', '确认',
  '关闭', '取消',
  '跳过', '稍后再说', '稍后', '不再提示',
  '我已阅读并同意', '同意并继续'
]

/** 单字关闭符号 */
const CLOSE_GLYPHS = ['×', '✕', '✖', '⨯', '╳']

/**
 * 浏览器侧的弹窗识别 / 关闭脚本。
 * 一次 evaluate 内完成扫描 + 点击，避免多次 round-trip。
 *
 * @returns {{
 *   dismissed: boolean,
 *   reason?: 'TEXT' | 'CLASS' | 'ARIA' | 'GLYPH',
 *   text?: string,
 *   outerHtml?: string,
 *   overlaySignature?: string
 * }}
 */
function dismissInPageBody (closeTexts, closeGlyphs) {
  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return false
    // opacity 既可能是 '0' 也可能是 '0.0'/'0.00' 等，用 parseFloat 兜底
    if (parseFloat(cs.opacity) <= 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 1) 扫描候选浮层。先用窄选择器（CSS class/role 显式标记 dialog/popup 等的元素）；
  //    命中即可避免对整页 querySelectorAll('*') 做样式计算 —— 在大型 SPA 上能省下 O(N) 的 getComputedStyle。
  //    若窄查询过滤后仍为空，再回退到全量扫描（带元素数上限），覆盖无标记的 hand-rolled 浮层。
  const NARROW_SEL = '[class*="dialog"],[class*="popup"],[class*="modal"],[class*="mask"],[class*="overlay"],[class*="drawer"],[role="dialog"],[role="alertdialog"]'
  const FULL_SCAN_CAP = 5000
  const collectFrom = (nodes) => {
    const out = []
    let scanned = 0
    for (const el of nodes) {
      if (++scanned > FULL_SCAN_CAP) break
      if (!isVisible(el)) continue
      const cs = getComputedStyle(el)
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (area < vw * vh * 0.05) continue
      if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) continue
      const z = parseInt(cs.zIndex || '0', 10) || 0
      const cls = (el.className && typeof el.className === 'string') ? el.className : (el.getAttribute && el.getAttribute('class')) || ''
      const looksLikeDialog = /dialog|popup|modal|mask|overlay|drawer/i.test(cls)
      if (z < 100 && !looksLikeDialog) continue
      // 排除：业务流程主动打开、不该被自动关闭的 dialog（在线/附件简历预览、索取简历确认）
      if (/resume-common-dialog|ask-for-resume-confirm|c-resume/i.test(cls)) continue
      out.push({ el, z, area, looksLikeDialog })
    }
    return out
  }
  let overlays = document.body ? collectFrom(document.body.querySelectorAll(NARROW_SEL)) : []
  if (overlays.length === 0 && document.body) {
    overlays = collectFrom(document.body.querySelectorAll('*'))
  }

  // 优先级：明显是 dialog 的 + z-index 高 + 面积大
  overlays.sort((a, b) => {
    if (a.looksLikeDialog !== b.looksLikeDialog) return a.looksLikeDialog ? -1 : 1
    if (b.z !== a.z) return b.z - a.z
    return b.area - a.area
  })

  const findClose = (root) => {
    const candidates = root.querySelectorAll('button, [role="button"], a, span, div, i')
    let best = null
    for (const c of candidates) {
      if (!isVisible(c)) continue
      // 只考虑可点击 / 有 cursor pointer 的元素
      const cs = getComputedStyle(c)
      const looksClickable = c.tagName === 'BUTTON' || c.getAttribute('role') === 'button' ||
        cs.cursor === 'pointer' ||
        /btn|button|close|confirm|sure|know|agree/i.test(c.className || '')
      if (!looksClickable) continue
      const text = (c.innerText || c.textContent || '').trim()
      const aria = (c.getAttribute('aria-label') || '') + ' ' + (c.getAttribute('title') || '')
      const cls = c.className || ''

      // 1) 文本严格匹配（短文本，整段就是按钮文案）
      if (text.length > 0 && text.length <= 12) {
        for (const t of closeTexts) {
          if (text === t || text.includes(t)) {
            return { btn: c, reason: 'TEXT', text }
          }
        }
        for (const g of closeGlyphs) {
          if (text === g) return { btn: c, reason: 'GLYPH', text }
        }
      }
      // 2) class / aria 匹配关闭语义
      if (/close|dismiss|confirm-btn|btn-sure/i.test(cls)) {
        if (!best) best = { btn: c, reason: 'CLASS', text: text.slice(0, 30) }
      }
      if (/close|dismiss/i.test(aria)) {
        if (!best) best = { btn: c, reason: 'ARIA', text: aria.trim().slice(0, 30) }
      }
    }
    return best
  }

  for (const ov of overlays) {
    const hit = findClose(ov.el)
    if (!hit) continue
    const r = hit.btn.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    // 触发真实 click（HTMLElement.click() 同时通知 Vue/React 监听）
    try {
      hit.btn.click()
    } catch (_) {
      // ignore
    }
    const outerHtml = (ov.el.outerHTML || '').slice(0, 400)
    const sigParts = []
    if (ov.el.id) sigParts.push('#' + ov.el.id)
    if (ov.el.className) sigParts.push('.' + String(ov.el.className).split(/\s+/).slice(0, 2).join('.'))
    return {
      dismissed: true,
      reason: hit.reason,
      text: hit.text,
      outerHtml,
      overlaySignature: sigParts.join('') || ov.el.tagName.toLowerCase()
    }
  }
  return { dismissed: false }
}

/**
 * 在 page / frame 上扫描并关闭一个挡住操作的浮层。
 * 调用方可循环调用直到 false（最多 N 次）以处理叠加弹窗。
 * @param {import('puppeteer').Page | import('puppeteer').Frame} ctx
 * @returns {Promise<{dismissed: boolean, reason?: string, text?: string, overlaySignature?: string, outerHtml?: string}>}
 */
export async function tryDismissOneOverlay (ctx) {
  try {
    const result = await ctx.evaluate(dismissInPageBody, CLOSE_TEXTS, CLOSE_GLYPHS)
    if (result?.dismissed) {
      logInfo('[dialog-dismisser] 自动关闭浮层：', result.overlaySignature, '匹配=', result.reason, '文案=', result.text)
      logDebug('[dialog-dismisser] outerHTML 摘要：', result.outerHtml)
    }
    return result || { dismissed: false }
  } catch (e) {
    logDebug('[dialog-dismisser] evaluate 失败:', e?.message)
    return { dismissed: false }
  }
}

/**
 * 多次循环尝试关闭浮层（应对叠加 / 关一个出一个的情况）。
 *
 * 每次 click 后等 gapMs 再重新扫描：若下一轮扫到的是同一个浮层（signature 相同），
 * 说明 click 没有触发关闭（可能是 disabled 按钮或事件被吞），记为一次"无进展"；
 * 连续 2 次无进展则提前终止，避免无限点击失效按钮。
 *
 * @param {import('puppeteer').Page | import('puppeteer').Frame} ctx
 * @param {{ maxRounds?: number, gapMs?: number }} [opts]
 * @returns {Promise<number>} 成功关闭的浮层数量
 */
export async function dismissBlockingOverlays (ctx, opts = {}) {
  const maxRounds = opts.maxRounds ?? 3
  const gapMs = opts.gapMs ?? 350
  let count = 0
  let staleSig = null   // 上一轮被点击但可能未关掉的浮层 signature
  let staleCount = 0    // 连续无进展次数
  for (let i = 0; i < maxRounds; i++) {
    const r = await tryDismissOneOverlay(ctx)
    if (!r.dismissed) break
    await sleep(gapMs)
    // 检查是否真正消失：若 signature 与上轮相同，视为 click 无效
    if (r.overlaySignature && r.overlaySignature === staleSig) {
      staleCount++
      logDebug('[dialog-dismisser] 浮层', r.overlaySignature, '点击后仍存在（staleCount=', staleCount, '）')
      if (staleCount >= 2) {
        logInfo('[dialog-dismisser] 浮层', r.overlaySignature, '连续 2 次点击无效，终止重试')
        break
      }
    } else {
      // 新出现的浮层（或浮层已关且另一个冒出），重置计数
      staleSig = r.overlaySignature
      staleCount = 0
      count++
    }
  }
  return count
}

/**
 * 检查 (x, y) 处的最顶层元素是否是 expectedEl 或其后代。被其他元素遮挡返回 blocked=true。
 *
 * 坐标系：x/y 必须是 **viewport / client 坐标**（即 `document.elementFromPoint` 期望的坐标系，
 * 与 `getBoundingClientRect()` 返回值一致）。Puppeteer 的 `ElementHandle.boundingBox()`
 * 返回的也是 viewport-relative 坐标（与 `page.mouse.click` 接受的坐标系相同），所以可直接传入。
 * 若调用方手头是 document/page 坐标（含 scroll 偏移），需先减去 `window.scrollX/scrollY`。
 *
 * @param {import('puppeteer').Page | import('puppeteer').Frame} ctx
 * @param {import('puppeteer').ElementHandle} expectedEl
 * @param {number} x viewport x 坐标
 * @param {number} y viewport y 坐标
 * @returns {Promise<{blocked: boolean, topTag?: string, topClass?: string}>}
 */
export async function checkBlockedAt (ctx, expectedEl, x, y) {
  try {
    const result = await ctx.evaluate((targetEl, px, py) => {
      const top = document.elementFromPoint(px, py)
      if (!top) return { blocked: false }
      // 只有 top === target 或 top 是 target 的后代时才认为未被遮挡。
      // top 是 target 的祖先意味着 target 上方有元素拦截了点击事件（pointer-events 转发到祖先）。
      if (top === targetEl || (targetEl && targetEl.contains && targetEl.contains(top))) {
        return { blocked: false }
      }
      return {
        blocked: true,
        topTag: top.tagName?.toLowerCase(),
        topClass: (typeof top.className === 'string' ? top.className : '').slice(0, 60)
      }
    }, expectedEl, x, y)
    return result || { blocked: false }
  } catch (_) {
    return { blocked: false }
  }
}

/**
 * 安全点击：先校验目标是否被遮挡，被挡则尝试关闭浮层后重试。
 *
 * 兼容 humanMouse 的 cursor.click({x, y})。当 ctx 是 Frame，elementFromPoint
 * 是 frame 内部坐标系，但 boundingBox() 是 page 坐标——所以这里 ctx 应当与 expectedEl
 * 来自同一上下文（Frame 元素就传 Frame，主页面元素就传 Page）。
 *
 * @param {{
 *   ctx: import('puppeteer').Page | import('puppeteer').Frame,
 *   page: import('puppeteer').Page,
 *   element: import('puppeteer').ElementHandle,
 *   cursor: { click: (p:{x:number,y:number}) => Promise<void> },
 *   maxRetries?: number,
 *   logPrefix?: string
 * }} args
 * @returns {Promise<{ clicked: boolean, dismissedCount: number, error?: string }>}
 *   - clicked: 是否真正发出过一次成功的点击调用（cursor.click 或 element.click 未抛错）
 *   - dismissedCount: 期间被启发式关掉的浮层数
 *   - error: 失败原因（NO_BOUNDING_BOX_AND_CLICK_FAILED / BLOCKED_AND_DISMISS_FAILED / RETRY_EXHAUSTED 等）
 */
export async function safeClickElement (args) {
  const { ctx, page, element, cursor, maxRetries = 3, logPrefix = '[safe-click]' } = args
  let dismissedCount = 0
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const box = await element.boundingBox().catch(() => null)
    if (!box) {
      logDebug(logPrefix, '元素无 boundingBox，回退到 element.click()')
      let ok = true
      await element.click().catch((e) => {
        ok = false
        logDebug(logPrefix, 'element.click() 抛错：', e?.message)
      })
      return ok
        ? { clicked: true, dismissedCount }
        : { clicked: false, dismissedCount, error: 'NO_BOUNDING_BOX_AND_CLICK_FAILED' }
    }
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // ctx 上的 elementFromPoint 用的是 ctx 自己的 viewport 坐标。
    // 当 ctx === page，box 已是主页面 viewport 坐标，可直接传给 elementFromPoint。
    // 当 ctx 是 frame，boundingBox 返回的是主页面 viewport 坐标但 frame 内 elementFromPoint
    // 期待 frame 自己的坐标系——保守跳过遮挡检测（iframe 内罕见全局弹窗，主页面才是高发区）。
    const sameAsPage = ctx === page
    let blocked = { blocked: false }
    if (sameAsPage) {
      blocked = await checkBlockedAt(ctx, element, cx, cy)
    }

    if (blocked.blocked) {
      logInfo(logPrefix, `点击目标被遮挡（top=${blocked.topTag}.${blocked.topClass}），尝试自动关闭浮层…`)
      const n = await dismissBlockingOverlays(page)
      dismissedCount += n
      if (n === 0) {
        logDebug(logPrefix, '未识别到可关闭的浮层，强制点击一次后返回（成功率不保证）')
        let ok = true
        await cursor.click({ x: cx, y: cy }).catch((e) => {
          ok = false
          logDebug(logPrefix, 'cursor.click 抛错：', e?.message)
        })
        return ok
          ? { clicked: true, dismissedCount, error: 'CLICKED_WHILE_BLOCKED' }
          : { clicked: false, dismissedCount, error: 'BLOCKED_AND_DISMISS_FAILED' }
      }
      // 关闭后重试
      continue
    }
    let ok = true
    await cursor.click({ x: cx, y: cy }).catch((e) => {
      ok = false
      logDebug(logPrefix, 'cursor.click 抛错：', e?.message)
    })
    if (ok) return { clicked: true, dismissedCount }
    // cursor 点击失败也用 retry 兜底
  }
  // 重试用尽
  const box = await element.boundingBox().catch(() => null)
  let ok = false
  if (box) {
    ok = true
    await cursor.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 }).catch(() => { ok = false })
  }
  return ok
    ? { clicked: true, dismissedCount, error: 'RETRY_EXHAUSTED_BUT_FINAL_CLICK_OK' }
    : { clicked: false, dismissedCount, error: 'RETRY_EXHAUSTED' }
}
