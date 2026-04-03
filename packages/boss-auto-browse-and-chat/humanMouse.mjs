/**
 * 拟人鼠标轨迹封装（招聘端专用）
 *
 * BOSS 对招聘端鼠标移动轨迹进行埋点，直接 page.click() 或 page.mouse.click(x,y)
 * 的"瞬移"方式容易被识别为脚本。本模块封装 ghost-cursor，以贝塞尔曲线生成拟人
 * 移动路径，替换所有在招聘端页面上的点击操作。
 *
 * 用法：
 *   import { createHumanCursor } from './humanMouse.mjs'
 *   const cursor = await createHumanCursor(page)
 *   await cursor.click(selector)   // 先沿轨迹移动，再点击
 *   await cursor.move(selector)    // 仅移动，不点击
 */

/**
 * 为给定 Puppeteer page 创建拟人鼠标 cursor。
 * 内部使用 ghost-cursor；若 ghost-cursor 不可用（如包未安装），
 * 则 fallback 到普通 page.click()，并打印警告。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @returns {Promise<{
 *   click: (selectorOrPos: string | {x: number, y: number}) => Promise<void>,
 *   move:  (selectorOrPos: string | {x: number, y: number}) => Promise<void>
 * }>}
 */
export async function createHumanCursor (page) {
  let ghostCursorCreate
  try {
    const mod = await import('ghost-cursor')
    // ghost-cursor 同时支持 ESM default export 和命名 export
    ghostCursorCreate = mod.createCursor ?? mod.default?.createCursor
  } catch {
    ghostCursorCreate = null
  }

  if (ghostCursorCreate) {
    const cursor = ghostCursorCreate(page)

    /**
     * 将 selector 字符串或 ElementHandle 解析成 {x, y} 坐标。
     * ghost-cursor 的 click/move 只接受 string selector 或 ElementHandle，
     * 传 {x,y} 坐标对象会被误当 ElementHandle 调 element.remoteObject() 崩溃。
     * 统一在封装层解析成坐标，再用 moveTo({x,y}) + page.mouse.click(x,y) 执行。
     */
    const resolvePos = async (selectorOrPos) => {
      if (typeof selectorOrPos === 'string') {
        const el = await page.$(selectorOrPos)
        if (!el) throw new Error(`[humanMouse] element not found: ${selectorOrPos}`)
        const box = await el.boundingBox()
        if (!box) throw new Error(`[humanMouse] element has no bounding box: ${selectorOrPos}`)
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      // ElementHandle（有 boundingBox 方法）
      if (selectorOrPos && typeof selectorOrPos.boundingBox === 'function') {
        const box = await selectorOrPos.boundingBox()
        if (!box) throw new Error('[humanMouse] ElementHandle has no bounding box')
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      // 已是 {x, y} 坐标对象
      return selectorOrPos
    }

    return {
      /**
       * 沿拟人轨迹移动到目标后点击。使用 moveTo({x,y}) + page.mouse.click(x,y)
       * 规避 ghost-cursor 传坐标/ElementHandle 时调 element.evaluate 的崩溃问题。
       * @param {string | {x: number, y: number} | import('puppeteer').ElementHandle} selectorOrPos
       */
      async click (selectorOrPos) {
        const pos = await resolvePos(selectorOrPos)
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

  // Fallback: ghost-cursor 未安装时退化为普通点击（打印警告）
  console.warn('[humanMouse] ghost-cursor 未安装，退化为普通 page.click()。建议安装 ghost-cursor 以规避 BOSS 鼠标轨迹埋点检测。')
  return {
    async click (selectorOrPos) {
      if (typeof selectorOrPos === 'string') {
        await page.click(selectorOrPos)
      } else if (selectorOrPos && typeof selectorOrPos.x === 'number') {
        await page.mouse.click(selectorOrPos.x, selectorOrPos.y)
      }
    },
    async move (selectorOrPos) {
      if (typeof selectorOrPos === 'string') {
        try {
          const el = await page.$(selectorOrPos)
          if (el) {
            const box = await el.boundingBox()
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            }
          }
        } catch (_) { /* ignore */ }
      } else if (selectorOrPos && typeof selectorOrPos.x === 'number') {
        await page.mouse.move(selectorOrPos.x, selectorOrPos.y)
      }
    }
  }
}
