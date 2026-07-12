import fs from 'node:fs/promises'
import path from 'node:path'

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

export function createBackendBrowserRuntime({ runtimePaths }) {
  const browsers = new Set()
  const launch = async (options) => {
    const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
    const { puppeteer } = await initPuppeteer()
    const browser = await puppeteer.launch(options)
    browsers.add(browser)
    browser.once('disconnected', () => browsers.delete(browser))
    return browser
  }
  return {
    async openBoss({ taskReporter, onBrowserOpened }) {
      const browser = await launch({ headless: false, ignoreHTTPSErrors: true, defaultViewport: { width: 1440, height: 800 } })
      onBrowserOpened?.(browser)
      const [page] = await browser.pages()
      const cookies = await readJson(path.join(runtimePaths.storageDir, 'boss-cookies.json'), [])
      if (!cookies.length) throw Object.assign(new Error('Boss cookies are required'), { code: 'COOKIE_INVALID' })
      for (const cookie of cookies) await page.setCookie({ ...cookie, ...(Object.hasOwn(cookie, 'sameSite') ? { sameSite: 'unspecified' } : {}) })
      const localStorage = await readJson(path.join(runtimePaths.storageDir, 'boss-local-storage.json'), {})
      const { setDomainLocalStorage } = await import('@geekgeekrun/utils/puppeteer/local-storage.mjs')
      await setDomainLocalStorage(browser, 'https://www.zhipin.com/desktop/', localStorage)
      await page.goto('https://www.zhipin.com/web/geek/chat', { timeout: 0 })
      taskReporter.emit('task.progress', { state: 'page-opened', url: page.url() })
    },
    async openLogin({ taskReporter, onBrowserOpened }) {
      const { ensureEditThisCookie, editThisCookieExtensionPath } = await import('@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension/utils.mjs')
      await ensureEditThisCookie()
      const browser = await launch({ headless: false, pipe: true, enableExtensions: [editThisCookieExtensionPath] })
      onBrowserOpened?.(browser)
      const [page] = await browser.pages()
      await page.goto('https://www.zhipin.com/web/user/', { timeout: 0 })
      taskReporter.emit('task.progress', { state: 'page-opened', url: page.url() })
    },
    async close() { await Promise.allSettled([...browsers].map((browser) => browser.close())) }
  }
}
