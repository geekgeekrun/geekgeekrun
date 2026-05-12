/**
 * 拟人鼠标轨迹封装（招聘端专用）
 *
 * BOSS 对招聘端鼠标移动轨迹进行埋点，直接 page.click() 或 page.mouse.click(x,y)
 * 的"瞬移"方式容易被识别为脚本。本模块封装 ghost-cursor，以贝塞尔曲线生成拟人
 * 移动路径，替换所有在招聘端页面上的点击操作。
 *
 * 用法：
 *   import { createHumanCursor, randomizeInitialCursorPosition } from './humanMouse.mjs'
 *   const cursor = await createHumanCursor(page)
 *   await randomizeInitialCursorPosition(page)
 *   await cursor.click(selector)   // 先沿轨迹移动，再点击
 *   await cursor.move(selector)    // 仅移动，不点击
 */

// 模块级缓存：首次成功 preflight 后避免重复 import
let cachedGhostCursorCreate = null

/**
 * 预检查 ghost-cursor 是否可用，返回其 createCursor 函数。
 * 失败时抛出明确错误，避免静默退化为 page.click() 这种"以为隐身实则裸奔"的最坏情况。
 *
 * @returns {Promise<Function>} ghost-cursor 的 createCursor 函数
 */
export async function preflightGhostCursor () {
  if (cachedGhostCursorCreate) return cachedGhostCursorCreate
  let createCursor
  try {
    const mod = await import('ghost-cursor')
    // ghost-cursor 同时支持 ESM default export 和命名 export
    createCursor = mod.createCursor ?? mod.default?.createCursor
  } catch (e) {
    throw new Error(
      'GHOST_CURSOR_UNAVAILABLE: ghost-cursor failed to load — refusing to run with bot-like clicks. Reinstall dependencies (pnpm -F @geekgeekrun/boss-auto-browse-and-chat install).'
    )
  }
  if (typeof createCursor !== 'function') {
    throw new Error(
      'GHOST_CURSOR_UNAVAILABLE: ghost-cursor failed to load — refusing to run with bot-like clicks. Reinstall dependencies (pnpm -F @geekgeekrun/boss-auto-browse-and-chat install).'
    )
  }
  cachedGhostCursorCreate = createCursor
  return createCursor
}

/**
 * 在 box 的中心 60% 区域内随机一个落点（默认 centerBiasFraction=0.3，即中心 ±30%）。
 * 避免每次点击都落在精确几何中心，这本身就是脚本特征。
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {number} [centerBiasFraction=0.3]
 * @returns {{x: number, y: number}}
 */
function randomizePointInBox (box, centerBiasFraction = 0.3) {
  const minXFrac = 0.5 - centerBiasFraction
  const maxXFrac = 0.5 + centerBiasFraction
  const minYFrac = 0.5 - centerBiasFraction
  const maxYFrac = 0.5 + centerBiasFraction
  const xFrac = minXFrac + Math.random() * (maxXFrac - minXFrac)
  const yFrac = minYFrac + Math.random() * (maxYFrac - minYFrac)
  return {
    x: box.x + box.width * xFrac,
    y: box.y + box.height * yFrac
  }
}

/**
 * 为给定 Puppeteer page 创建拟人鼠标 cursor。
 * 内部强依赖 ghost-cursor；若不可用直接抛错（fail-fast），不再静默退化。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @returns {Promise<{
 *   click: (selectorOrPos: string | {x: number, y: number}) => Promise<void>,
 *   move:  (selectorOrPos: string | {x: number, y: number}) => Promise<void>
 * }>}
 */
export async function createHumanCursor (page) {
  const ghostCursorCreate = await preflightGhostCursor()
  const cursor = ghostCursorCreate(page)

  /**
   * 将 selector 字符串或 ElementHandle 解析成 {x, y} 坐标。
   * ghost-cursor 的 click/move 只接受 string selector 或 ElementHandle，
   * 传 {x,y} 坐标对象会被误当 ElementHandle 调 element.remoteObject() 崩溃。
   * 统一在封装层解析成坐标，再用 moveTo({x,y}) + page.mouse.click(x,y) 执行。
   * 对 selector / ElementHandle 输入会在中心 60% 范围内随机落点；
   * 对显式 {x,y} 输入保持原样（调用方已选定精确坐标）。
   */
  const resolvePos = async (selectorOrPos) => {
    if (typeof selectorOrPos === 'string') {
      const el = await page.$(selectorOrPos)
      if (!el) throw new Error(`[humanMouse] element not found: ${selectorOrPos}`)
      const box = await el.boundingBox()
      if (!box) throw new Error(`[humanMouse] element has no bounding box: ${selectorOrPos}`)
      return randomizePointInBox(box)
    }
    // ElementHandle（有 boundingBox 方法）
    if (selectorOrPos && typeof selectorOrPos.boundingBox === 'function') {
      const box = await selectorOrPos.boundingBox()
      if (!box) throw new Error('[humanMouse] ElementHandle has no bounding box')
      return randomizePointInBox(box)
    }
    // 已是 {x, y} 坐标对象，调用方已选定精确坐标，不再随机化
    return selectorOrPos
  }

  return {
    /**
     * 沿拟人轨迹移动到目标后点击。使用 moveTo({x,y}) + page.mouse.click(x,y)
     * 规避 ghost-cursor 传坐标/ElementHandle 时调 element.evaluate 的崩溃问题。
     * 以约 0.5 概率先做一次轻微 overshoot 移动，模拟真实用户在按钮附近犹豫/减速。
     * @param {string | {x: number, y: number} | import('puppeteer').ElementHandle} selectorOrPos
     */
    async click (selectorOrPos) {
      const pos = await resolvePos(selectorOrPos)
      if (Math.random() < 0.5) {
        const vp = page.viewport() || { width: 1280, height: 720 }
        const overshoot = {
          x: Math.max(1, Math.min(vp.width - 1, pos.x + (Math.random() * 60 - 30))),
          y: Math.max(1, Math.min(vp.height - 1, pos.y + (Math.random() * 30 - 15)))
        }
        await cursor.moveTo(overshoot)
      }
      await cursor.moveTo(pos)
      await page.mouse.click(pos.x, pos.y)
    },
    /**
     * 沿拟人轨迹移动到目标（不点击）
     * @param {string | {x: number, y: number} | import('puppeteer').ElementHandle} selectorOrPos
     */
    async move (selectorOrPos) {
      const pos = await resolvePos(selectorOrPos)
      await cursor.moveTo(pos)
    }
  }
}

/**
 * 将鼠标移动到 viewport 内一个随机位置，避免每次会话都从 (0,0) 起步这一明显特征。
 * 由集成方在合适时机（如打开页面后）显式调用，createHumanCursor 不会自动调用它。
 *
 * @param {import('puppeteer').Page} page
 */
export async function randomizeInitialCursorPosition (page) {
  // Move cursor to a random viewport position (avoids the (0,0) start signature)
  const viewport = page.viewport() || { width: 1280, height: 720 }
  const x = 200 + Math.floor(Math.random() * (viewport.width - 400))
  const y = 100 + Math.floor(Math.random() * (viewport.height - 200))
  await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) })
}
