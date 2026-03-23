import type { Browser } from 'puppeteer'

export const setDomainLocalStorage = async (
  browser: Browser,
  url: string,
  kv: Record<string, string>
): Promise<void> => {
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  page.on('request', r => {
    r.respond({
      status: 200,
      contentType: 'text/plain',
      body: ':)',
    })
  })
  await page.goto(url)
  await page.evaluate((kv: Record<string, string>) => {
    Object.keys(kv).forEach(k => {
      localStorage.setItem(k, kv[k])
    })
  }, kv)
  await page.close()
}
