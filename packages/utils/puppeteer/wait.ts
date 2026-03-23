import type { Browser, Page } from 'puppeteer'

export async function waitForPage(
  browser: Browser,
  predicate: (page: Page) => boolean | Promise<boolean>,
  options: {
    polling?: number
    timeout?: number
  } = {}
): Promise<Page> {
  const { polling = 1000, timeout = 10 * 1000 } = options

  let intervalTimer: NodeJS.Timeout | null = null
  let timeoutTimer: NodeJS.Timeout | null = null

  return await new Promise((resolve, reject) => {
    timeoutTimer = setTimeout(() => {
      if (intervalTimer) clearInterval(intervalTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
      reject(new Error(`waitForPage timeout after ${timeout} ms`))
    }, timeout)

    intervalTimer = setInterval(async () => {
      const allPages = await browser.pages()
      for (let i = allPages.length - 1; i >= 0; i--) {
        const currentPage = allPages[i]
        if (await predicate(currentPage)) {
          if (intervalTimer) clearInterval(intervalTimer)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          resolve(currentPage)
          return
        }
      }
    }, polling)
  })
}
