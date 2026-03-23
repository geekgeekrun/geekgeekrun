import type { Page, HTTPRequest } from 'puppeteer'

export async function blockNavigation(
  page: Page,
  predictor: (url: HTTPRequest) => boolean = () => true
): Promise<{
  dispose: () => Promise<void>
}> {
  console.log(`block navigation for puppeteer page from url ${page.url()}`)
  await page.setRequestInterception(true)

  const handler = (req: HTTPRequest) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && predictor(req)) {
      req.abort('aborted')
    } else {
      try {
        req.continue()
      } catch {
        // 忽略错误
      }
    }
  }

  page.on('request', handler)

  return {
    dispose: async () => {
      page.off('request', handler)
      await page.setRequestInterception(false)
    }
  }
}
