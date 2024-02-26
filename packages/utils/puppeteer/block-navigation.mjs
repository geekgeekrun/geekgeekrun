export async function blockNavigation(page, url) {
  console.log(`block navigation for puppeteer page from url ${url}`)
  await page.setRequestInterception(true)

  const handler = (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() !== url) {
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