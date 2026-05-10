import { sleep } from '@geekgeekrun/utils/sleep.mjs'

/**
 * Detect whether the page is currently showing BOSS security verification
 * (CAPTCHA / slider / 安全验证 / etc).
 *
 * Multi-signal: URL match + DOM elements + body text fallback.
 * Element-first (more robust than text, which can false-positive on candidate
 * descriptions that mention 验证).
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
export async function detectRiskControl(page) {
  try {
    const url = page.url()
    if (/verify|captcha|security.?check|safe\b|\/safe\/|安全验证/.test(url)) return true
    return await page.evaluate(() => {
      const hasVerifyEl = !!(
        document.querySelector('#nc_mask') ||
        document.querySelector('.verify-container') ||
        document.querySelector('.captcha-wrap') ||
        document.querySelector('.nc-container') ||
        document.querySelector('[class*="verify"][class*="wrap"]') ||
        document.querySelector('[class*="captcha"]') ||
        document.querySelector('.geetest_panel') ||
        document.querySelector('.geetest_box') ||
        document.querySelector('[id^="__yidun"]') ||
        document.querySelector('iframe[src*="captcha"]') ||
        document.querySelector('iframe[src*="verify"]') ||
        document.querySelector('.boss-popup__wrapper.dialog-verify')
      )
      if (hasVerifyEl) return true
      const bodyText = document.body?.innerText || ''
      const hasVerifyText =
        /请完成.{0,10}验证|安全验证|滑动.{0,6}滑块|人机验证|完成验证后继续|异常.{0,6}操作|操作过于频繁|请稍后再试.*继续|存在风险.*操作/.test(
          bodyText
        )
      return hasVerifyText
    })
  } catch {
    return false
  }
}

/**
 * Block until user manually completes verification, OR timeout.
 * Polls every 2s. Sends a desktop notification once on entry.
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [opts]
 * @param {string} [opts.expectedUrlPrefix] - if provided, only consider verification done when url returns to this prefix
 * @param {number} [opts.timeoutMs=300000] - default 5 min
 * @param {(msg: string) => void} [opts.log] - optional logger
 * @returns {Promise<boolean>} true if completed, false if timed out
 */
export async function waitForRiskControlCompletion(page, opts = {}) {
  const { expectedUrlPrefix, timeoutMs = 300000, log } = opts
  const logFn = typeof log === 'function' ? log : () => {}

  logFn('⚠️  检测到 BOSS 安全验证...')

  try {
    const { Notification } = await import('electron')
    new Notification({
      title: 'GeekGeekRun - 需要人工验证',
      body: '检测到 BOSS 直聘安全验证，请在浏览器窗口中完成验证，完成后程序将自动继续。'
    }).show()
  } catch {
    /* Notification 不可用时静默忽略 */
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(2000)
    try {
      const isStillVerify = await detectRiskControl(page)
      if (expectedUrlPrefix) {
        const url = page.url()
        if (url.startsWith(expectedUrlPrefix) && !isStillVerify) {
          logFn('✅ 安全验证已完成')
          return true
        }
      } else if (!isStillVerify) {
        logFn('✅ 安全验证已完成')
        return true
      }
    } catch {
      /* 页面可能正在跳转，继续等待 */
    }
  }
  logFn('验证等待超时（5 分钟）')
  return false
}

/**
 * Convenience: detect and, if positive, wait for completion.
 *
 * @param {import('puppeteer').Page} page
 * @param {object} [opts] - same as waitForRiskControlCompletion
 * @returns {Promise<'no-risk'|'completed'|'timed-out'>}
 */
export async function checkpointRiskControl(page, opts = {}) {
  const detected = await detectRiskControl(page)
  if (!detected) return 'no-risk'
  const completed = await waitForRiskControlCompletion(page, opts)
  return completed ? 'completed' : 'timed-out'
}
