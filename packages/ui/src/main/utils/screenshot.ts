import { sendToDaemon } from "../flow/OPEN_SETTING_WINDOW/connect-to-daemon"
import { checkShouldExit } from "./worker"

export const SCREENSHOT_INTERVAL_MS = 2500

export async function pushCurrentPageScreenshot (page) {
  try {
    if (!page) {
      return
    }
    // 尝试截图当前页面（压缩为 jpeg + base64，避免文件写盘）
    const screenshotBase64 = await page.screenshot({
      type: 'jpeg',
      quality: 60,
      encoding: 'base64',
      fullPage: false
    })
    const screenshotAt = Date.now()
    await sendToDaemon({
      type: 'worker-screenshot',
      workerId: process.env.GEEKGEEKRUND_WORKER_ID,
      data: {
        screenshot: `data:image/jpeg;base64,${screenshotBase64}`,
        screenshotAt,
        pageUrl: page.url?.() ?? null
      }
    })
  } catch (err) {
    // 截图失败不应影响主流程
    console.warn('[READ_NO_REPLY_AUTO_REMINDER] pushCurrentPageScreenshot error', err)
  }
}

export class PeriodPushCurrentPageScreenshotPlugin {
  apply(hooks) {
    hooks.pageGotten.tap(
      'PeriodPushCurrentPageScreenshotPlugin',
      (page) => {
        async function periodPushCurrentPageScreenshot () {
          try {
            if (!page) {
              return
            }
            if (page.isClosed()) {
              return
            }
            const shouldExit = await checkShouldExit()
            if (shouldExit) {
              return
            }
            await pushCurrentPageScreenshot(page)
            setTimeout(periodPushCurrentPageScreenshot, SCREENSHOT_INTERVAL_MS)
          }
          catch {}
        }
        periodPushCurrentPageScreenshot()
      }
    )
  }
}