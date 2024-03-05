export async function blockNavigation(page, predictor = (url) => true) {
  console.log(`block navigation for puppeteer page from url ${page.url()}`)
  await page.setRequestInterception(true)

  const handler = (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && predictor(req)) {
      req.abort('aborted')
    } else {
      try {
        req.continue()
      } catch {
        //
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