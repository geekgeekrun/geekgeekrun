/**
 * 招聘端简历数据提取工具：网络请求拦截 + Canvas 文字提取
 *
 * 沟通页在线简历有两套不同的数据（详见 plan/chat_page_resume_flow.md）：
 * - 简单摘要：geek/info、historyMsg body.resume 等 API 返回的只有简单工作单位、学校等，可拦截后 parseGeekInfoFromIntercepted 得到。
 * - 完整版（图片里那种）：接收加密数据 → WASM（Rust decrypt.rs，Base64+AES）解密 → 仅绘制到 #resume 的 Canvas，无明文 API；要拿完整版要么 Canvas hook（有反爬风险），要么逆向 examples/wasm_canvas_bg-1.0.2-5057.dcmp 的解密逻辑。
 */

// ---------------------------------------------------------------------------
// 网络拦截
// ---------------------------------------------------------------------------

/** 需要拦截的 URL 关键词（招聘端简历/候选人相关 API），含沟通页 geek/info */
const INTERCEPT_URL_KEYWORDS = ['resume', 'geek/info', 'geek/detail']

/**
 * 从 URL 中提取用于存储的 path 部分（便于去重与查找）
 * @param {string} url - 完整 URL
 * @returns {string} path 或原 URL
 */
function getPathFromUrl (url) {
  try {
    const u = new URL(url)
    return u.pathname || url
  } catch {
    return url
  }
}

/**
 * 判断 URL 是否包含任一拦截关键词
 * @param {string} url
 * @returns {boolean}
 */
function shouldIntercept (url) {
  return INTERCEPT_URL_KEYWORDS.some(kw => url.includes(kw))
}

/**
 * 在页面上设置网络响应拦截器，收集简历相关 API 的 JSON 响应。
 * 与 laodeng 无冲突，仅在 Node 侧监听 response 事件。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @returns {{ getInterceptedData: () => Map<string, unknown> }} 返回 getInterceptedData，调用后返回当前收集到的数据并清空
 */
export function setupNetworkInterceptor (page) {
  const intercepted = new Map()

  page.on('response', async (response) => {
    const url = response.url()
    if (!shouldIntercept(url)) return
    const path = getPathFromUrl(url)
    try {
      const contentType = response.headers()['content-type'] || ''
      if (!contentType.includes('application/json')) return
      const data = await response.json()
      intercepted.set(path, data)
    } catch (_) {
      // 非 JSON 或解析失败则忽略
    }
  })

  /**
   * 获取当前已拦截的数据并清空 Map，便于单次详情页使用后取数
   * @returns {Map<string, unknown>} 本次拦截到的数据（path -> parsed JSON）
   */
  function getInterceptedData () {
    const snapshot = new Map(intercepted)
    intercepted.clear()
    return snapshot
  }

  /**
   * 查看当前已拦截的数据（不清空），便于在不消费数据的情况下检查是否有新数据
   * @returns {Map<string, unknown>} 当前拦截到的数据快照（path -> parsed JSON）
   */
  function peekInterceptedData () {
    return new Map(intercepted)
  }

  return { getInterceptedData, peekInterceptedData }
}

// ---------------------------------------------------------------------------
// 从拦截的 geek/info API 解析简历（沟通页推荐，不碰 Canvas）
// ---------------------------------------------------------------------------

/** 沟通页 geek/info API 路径特征 */
const GEEK_INFO_PATH = 'geek/info'

/**
 * 从 getInterceptedData() 的 Map 中取出 geek/info 的响应并解析为结构化数据与拼接文案。
 * 注意：geek/info 的 zpData.data 仅为简单摘要（工作单位、学校、经历列表等），与 #resume 上 WASM 解密后绘制的完整版简历不是同一份数据。
 *
 * @param {Map<string, unknown>} interceptedMap - getInterceptedData() 的返回值
 * @returns {{ data: object | null, text: string }} data 为 zpData.data，text 为摘要拼接（供简单关键词/LLM 筛选）
 */
export function parseGeekInfoFromIntercepted (interceptedMap) {
  if (!interceptedMap || interceptedMap.size === 0) {
    return { data: null, text: '' }
  }
  for (const [path, raw] of interceptedMap) {
    if (!path || !path.includes(GEEK_INFO_PATH)) continue
    const res = typeof raw === 'object' && raw !== null && 'zpData' in raw
      ? raw
      : null
    if (!res || !res.zpData || !res.zpData.data) {
      return { data: null, text: '' }
    }
    const d = res.zpData.data
    const parts = []
    if (d.name) parts.push(d.name)
    if (d.ageDesc) parts.push(d.ageDesc)
    if (d.workYear) parts.push(d.workYear)
    if (d.edu) parts.push(d.edu)
    if (d.positionStatus) parts.push(d.positionStatus)
    if (d.school) parts.push(d.school)
    if (d.major) parts.push(d.major)
    if (d.city) parts.push(d.city)
    if (d.salaryDesc || d.price) parts.push(d.salaryDesc || d.price)
    if (d.positionName || d.toPosition) parts.push(d.positionName || d.toPosition)
    if (Array.isArray(d.workExpList) && d.workExpList.length > 0) {
      parts.push('工作经历：')
      d.workExpList.forEach(w => {
        parts.push([w.timeDesc, w.company, w.positionName].filter(Boolean).join(' '))
      })
    }
    if (Array.isArray(d.eduExpList) && d.eduExpList.length > 0) {
      parts.push('教育经历：')
      d.eduExpList.forEach(e => {
        parts.push([e.timeDesc, e.school, e.major, e.degree].filter(Boolean).join(' '))
      })
    }
    const text = parts.join('\n')
    return { data: d, text }
  }
  return { data: null, text: '' }
}

// ---------------------------------------------------------------------------
// Canvas 文字 Hook（与 laodeng 兼容）— 非 BOSS 自带，可能被反爬检测，沟通页请用 API 拦截
// ---------------------------------------------------------------------------

/**
 * 在页面上通过 evaluateOnNewDocument 注入 Canvas fillText hook，将绘制文字收集到主页面 window.__canvasCapturedText。
 *
 * 实现原理：
 *   - evaluateOnNewDocument 会在主页面和每一个 iframe 中各执行一次。
 *   - 在线简历 iframe 带有 sandbox 属性且不含 allow-same-origin，主页面无法访问其 contentWindow，
 *     因此必须在 iframe 自身的执行上下文内直接 hook CanvasRenderingContext2D.prototype.fillText。
 *   - iframe 内 hook 到的文字通过 window.top.postMessage 批量发回主页面（同 origin 或跨 origin 均可用）。
 *   - 主页面监听 message 事件并累积到 window.__canvasCapturedText。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例（必须在 page.goto 之前调用）
 * @returns {Promise<{ getCapturedText: (page: import('puppeteer').Page) => Promise<Array<{text: string, x: number, y: number}>> }>}
 */
export async function setupCanvasTextHook (page) {
  // 转发浏览器内部 [canvasHook] 日志到 Node 侧，便于调试
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('[canvasHook]')) {
      console.log('[canvasHook-browser]', text)
    }
  })

  await page.evaluateOnNewDocument(() => {
    // 此脚本在每个 frame（主页面 + 所有 iframe）中各执行一次。
    // 策略：
    //   主页面 → 初始化收集数组，监听来自 iframe 的 postMessage
    //   iframe  → 直接 hook 当前窗口的 fillText，批量 postMessage 到 window.top

    const isTopFrame = (window === window.top)

    if (isTopFrame) {
      window.__canvasCapturedText = []
      window.addEventListener('message', (evt) => {
        if (evt.data && evt.data.__bossCanvasHook && Array.isArray(evt.data.__bossCanvasHook)) {
          if (!window.__canvasCapturedText) window.__canvasCapturedText = []
          for (const item of evt.data.__bossCanvasHook) {
            window.__canvasCapturedText.push(item)
          }
          console.log('[canvasHook] main received ' + evt.data.__bossCanvasHook.length + ' items, total ' + window.__canvasCapturedText.length)
        }
      })
      console.log('[canvasHook] main: message listener set')
    }

    // 在当前 window（无论是主页面还是 iframe）上 hook fillText
    try {
      const proto = window.CanvasRenderingContext2D?.prototype
      if (!proto) { console.log('[canvasHook] CanvasRenderingContext2D.prototype not found'); return }
      if (proto._bossHooked) { console.log('[canvasHook] already hooked, skip'); return }
      proto._bossHooked = true

      const origFillText = proto.fillText
      if (typeof origFillText !== 'function') { console.log('[canvasHook] fillText is not a function'); return }

      // 批量缓冲，用 setTimeout(0) 在一个事件循环 tick 后统一发送（WASM 会在同一个同步调用栈内连续 fillText）
      const captured = []
      let flushScheduled = false
      const flush = () => {
        flushScheduled = false
        if (captured.length === 0) return
        const items = captured.splice(0)
        if (isTopFrame) {
          if (!window.__canvasCapturedText) window.__canvasCapturedText = []
          for (const item of items) window.__canvasCapturedText.push(item)
          console.log('[canvasHook] main fillText wrote ' + items.length + ' items')
        } else {
          try {
            window.top.postMessage({ __bossCanvasHook: items }, '*')
            console.log('[canvasHook] iframe postMessage sent ' + items.length + ' items')
          } catch (e) {
            console.log('[canvasHook] postMessage failed: ' + e.message)
          }
        }
      }
      const scheduleFlush = () => {
        if (!flushScheduled) { flushScheduled = true; setTimeout(flush, 0) }
      }

      Object.defineProperty(proto, 'fillText', {
        value: new Proxy(origFillText, {
          apply (target, thisArg, args) {
            const [text, x, y] = args
            if (typeof text === 'string' && text.trim()) {
              captured.push({ text, x: Number(x) || 0, y: Number(y) || 0 })
              scheduleFlush()
            }
            return Reflect.apply(target, thisArg, args)
          }
        }),
        writable: true,
        configurable: true
      })
      console.log('[canvasHook] fillText hook installed, isTopFrame=' + isTopFrame + ' href=' + window.location.href)
    } catch (e) {
      console.log('[canvasHook] hook install error: ' + e.message)
    }
  })

  /**
   * 从主页面读取当前收集的 Canvas 文字并清空。
   * @param {import('puppeteer').Page} p - 同一页面实例
   * @returns {Promise<Array<{text: string, x: number, y: number}>>}
   */
  async function getCapturedText (p) {
    // 给浏览器 150ms 处理待发送的 setTimeout(0)/postMessage 队列
    await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)))
    const result = await p.evaluate(() => {
      const arr = window.__canvasCapturedText || []
      const copy = arr.map(({ text, x, y }) => ({ text, x, y }))
      window.__canvasCapturedText = []
      return copy
    })
    return result
  }

  /**
   * 清空主页面收集数组（不返回数据），用于切换候选人前丢弃上一个 iframe 的残留数据。
   * @param {import('puppeteer').Page} p - 同一页面实例
   */
  async function clearCapturedText (p) {
    await p.evaluate(() => { window.__canvasCapturedText = [] })
  }

  return { getCapturedText, clearCapturedText }
}

// ---------------------------------------------------------------------------
// 文字按行整理
// ---------------------------------------------------------------------------

/**
 * 将 Canvas 捕获的 { text, x, y } 数组按行分组并排序，拼接成按行排列的文字数组。
 * 同一行：y 坐标差 < 5px；同一行内按 x 排序后去重（相邻 x 差 ≤1px 的视为多次渲染同一字符），再拼接。
 *
 * BOSS 直聘在线简历会用多个叠加 Canvas（高清/普通各一层）以及 WASM 多次渲染，
 * 导致同一字符在相同坐标被 fillText 多次，必须去重否则每字会重复 N 次。
 *
 * @param {Array<{text: string, x: number, y: number}>} capturedTextArray - Canvas 捕获结果
 * @returns {string[]} 按行排列的文字数组（已去重）
 */
export function extractResumeText (capturedTextArray) {
  if (!Array.isArray(capturedTextArray) || capturedTextArray.length === 0) {
    return []
  }
  const Y_THRESHOLD = 5
  // x 坐标差在此范围内视为同一位置的重复绘制（多层/多次渲染）
  const X_DEDUP_THRESHOLD = 1
  const rows = new Map()

  for (const { text, x, y } of capturedTextArray) {
    const yKey = Math.round(y / Y_THRESHOLD) * Y_THRESHOLD
    if (!rows.has(yKey)) {
      rows.set(yKey, [])
    }
    rows.get(yKey).push({ text, x })
  }

  const sortedY = Array.from(rows.keys()).sort((a, b) => a - b)
  const lines = sortedY.map(yKey => {
    const items = rows.get(yKey)
    items.sort((a, b) => a.x - b.x)
    // 去重：相邻项 x 差 ≤ X_DEDUP_THRESHOLD 时视为同一字符的重复绘制，保留第一个
    const deduped = items.filter((item, i) =>
      i === 0 || Math.abs(item.x - items[i - 1].x) > X_DEDUP_THRESHOLD
    )
    return deduped.map(it => it.text).join('')
  })
  return lines
}

// ---------------------------------------------------------------------------
// 统一获取简历数据（API 优先，Canvas 兜底）
// ---------------------------------------------------------------------------

/**
 * 优先从拦截的 API 数据中取简历，若无则从页面 window.__canvasCapturedText 中提取（需先调用 setupCanvasTextHook）。
 *
 * @param {import('puppeteer').Page} page - Puppeteer 页面实例
 * @param {Map<string, unknown>} interceptedData - setupNetworkInterceptor 返回的 getInterceptedData() 的结果
 * @returns {Promise<{ source: 'api' | 'canvas', data: unknown }>} source 为 'api' 时 data 为 API 响应对象；为 'canvas' 时为 extractResumeText 的结果（字符串数组）
 */
export async function getResumeData (page, interceptedData) {
  if (interceptedData && interceptedData.size > 0) {
    const firstEntry = interceptedData.entries().next()
    if (!firstEntry.done) {
      const [path, data] = firstEntry.value
      return { source: 'api', data: { path, ...(typeof data === 'object' && data !== null ? data : { value: data }) } }
    }
  }
  const captured = await page.evaluate(() => {
    const arr = window.__canvasCapturedText || []
    const copy = arr.map(({ text, x, y }) => ({ text, x, y }))
    window.__canvasCapturedText = []
    return copy
  })
  const lines = extractResumeText(captured)
  return { source: 'canvas', data: lines }
}
