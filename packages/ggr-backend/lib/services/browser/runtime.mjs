import { createBrowserStorage, isValidCookieList } from './storage.mjs'
import { createBossPageListener } from './boss-page-listener.mjs'
import { ensureEditThisCookieExtension } from './extension.mjs'
import { createDefaultBrowserDependencies } from './dependencies/default-dependencies.mjs'

const LOGIN_ENDPOINTS = [
  'https://www.zhipin.com/wapi/zppassport/qrcode/loginConfirm',
  'https://www.zhipin.com/wapi/zppassport/qrcode/dispatcher',
  'https://www.zhipin.com/wapi/zppassport/login/phoneV2'
]
const LOGIN_URL = 'https://www.zhipin.com/web/user/'
const HOME_URL = 'https://www.zhipin.com/'
const BOSS_URL = 'https://www.zhipin.com/web/geek/chat'
const LOCAL_STORAGE_URL = 'https://www.zhipin.com/desktop/'

async function assertSuccessfulLoginResponse(response) {
  const status = response?.status?.()
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw Object.assign(new Error('Boss login response was not successful'), { code: 'LOGIN_FAILED' })
  }
  try {
    if ((await response.json())?.code !== 0) {
      throw new Error('Boss login response did not confirm success')
    }
  } catch {
    throw Object.assign(new Error('Boss login response did not confirm success'), { code: 'LOGIN_FAILED' })
  }
}

export function createBackendBrowserRuntime(options) {
  const { runtimePaths, records = {}, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = options
  const storage = options.storage ?? createBrowserStorage({ storageDir: runtimePaths.storageDir })
  const browsers = new Set()
  const dependencies = options.dependencies
    ? Promise.resolve(options.dependencies)
    : createDefaultBrowserDependencies({ runtimePaths })
  let bossBrowser
  let idleNotified = false
  let idleClose

  const launchBrowser = options.launchBrowser ?? (async (launchOptions) => {
    const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
    const { puppeteer } = await initPuppeteer()
    return puppeteer.launch(launchOptions)
  })
  const ensureExtension = options.ensureExtension ?? (() => ensureEditThisCookieExtension({ runtimePaths }))
  const setDomainLocalStorage = options.setDomainLocalStorage ?? (async (...args) => {
    const module = await import('@geekgeekrun/utils/puppeteer/local-storage.mjs')
    return module.setDomainLocalStorage(...args)
  })
  const blockPageNavigation = options.blockPageNavigation ?? (async (...args) => {
    const module = await import('@geekgeekrun/utils/puppeteer/block-navigation.mjs')
    return module.blockNavigation(...args)
  })
  const attachPageListener = options.attachPageListener ?? (async (target, reporter) => {
    const page = await target.page()
    if (page) return createBossPageListener({ page, storage, records, reporter })
  })

  async function browserLaunchOptions(extensionPath, { taskReporter, signal } = {}) {
    const browserDependencies = await dependencies
    let browserInfo = await browserDependencies.discover()
    if (!browserInfo?.executablePath) {
      taskReporter?.emit('task.progress', { state: 'dependency-download-started' })
      browserInfo = await browserDependencies.ensure({
        downloadProgressCallback(downloadedBytes, totalBytes) {
          taskReporter?.emit('task.progress', {
            state: 'dependency-download-progress', downloadedBytes, totalBytes
          })
        }
      })
    }
    if (!browserInfo?.executablePath) {
      throw Object.assign(new Error('No validated browser executable is available'), { code: 'BROWSER_EXECUTABLE_UNAVAILABLE' })
    }
    aborted(signal)
    taskReporter?.emit('task.progress', {
      state: 'dependency-ready', executablePath: browserInfo.executablePath, browser: browserInfo.browser
    })
    return { headless: false, pipe: true, executablePath: browserInfo.executablePath, enableExtensions: [extensionPath] }
  }

  const track = (browser) => {
    browsers.add(browser)
    idleNotified = false
    browser.once?.('disconnected', () => {
      browsers.delete(browser)
      if (bossBrowser === browser) bossBrowser = undefined
      void notifyIdle().catch(() => {})
    })
    return browser
  }

  const aborted = (signal) => {
    if (signal?.aborted) throw Object.assign(new Error('Browser task was cancelled'), { code: 'TASK_CANCELLED' })
  }

  const closeOnAbort = (browser, signal) => {
    const close = () => { void browser.close?.().catch(() => {}) }
    signal?.addEventListener?.('abort', close, { once: true })
    return () => signal?.removeEventListener?.('abort', close)
  }

  async function notifyIdle() {
    if (browsers.size || idleNotified || !options.onIdle) return idleClose
    idleNotified = true
    idleClose = Promise.resolve(options.onIdle())
    return idleClose
  }

  async function openLogin({ taskReporter, onBrowserOpened, signal }) {
    aborted(signal)
    const extensionPath = await ensureExtension()
    aborted(signal)
    const browser = track(await launchBrowser(await browserLaunchOptions(extensionPath, { taskReporter, signal })))
    onBrowserOpened?.(browser)
    const removeAbortClose = closeOnAbort(browser, signal)
    try {
      const [page] = await browser.pages()
      const navigationLock = await blockPageNavigation(page, (request) => !request.url().startsWith('https://www.zhipin.com'))
      try {
        page.on?.('popup', (popup) => popup.once?.('domcontentloaded', () => popup.close()))
        await page.goto(LOGIN_URL, { timeout: 0 })
        const [loginResponse] = await Promise.all([
          page.waitForResponse((response) => LOGIN_ENDPOINTS.some((url) => response.url().startsWith(url)), { timeout: 0 }),
          page.waitForNavigation({ timeout: 0 })
        ])
        await assertSuccessfulLoginResponse(loginResponse)
        await sleep(2000)
        const logo = await page.$('.header-home-logo')
        await Promise.all([logo ? logo.click() : page.goto(HOME_URL), page.waitForNavigation({ timeout: 0 })])
        if (page.url().startsWith('https://www.zhipin.com/web/common/security-check.html')) await page.waitForNavigation({ timeout: 0 })
        await sleep(2000)
        const [cookies, localStorage] = await Promise.all([
          page.cookies(),
          page.evaluate(() => JSON.parse(JSON.stringify(window.localStorage)))
        ])
        aborted(signal)
        if (!isValidCookieList(cookies)) throw Object.assign(new Error('Boss did not return valid cookies'), { code: 'COOKIE_INVALID' })
        await storage.writeSession({ cookies, localStorage })
        taskReporter.emit('task.progress', { state: 'cookie-collected', cookieCount: cookies.length })
      } finally {
        await navigationLock?.dispose?.()
      }
    } finally {
      removeAbortClose()
      await browser.close().catch(() => {})
    }
  }

  async function openBoss({ taskReporter, onBrowserOpened, signal, url = BOSS_URL }) {
    aborted(signal)
    const extensionPath = await ensureExtension()
    const session = await storage.readSession()
    if (!session || !isValidCookieList(session.cookies)) throw Object.assign(new Error('Boss cookies are required'), { code: 'COOKIE_INVALID' })
    const { cookies, localStorage } = session
    const browser = track(await launchBrowser(await browserLaunchOptions(extensionPath, { taskReporter, signal })))
    bossBrowser = browser
    onBrowserOpened?.(browser)
    const removeAbortClose = closeOnAbort(browser, signal)
    try {
      const [page] = await browser.pages()
      for (const cookie of cookies) await page.setCookie({ ...cookie, ...(Object.hasOwn(cookie, 'sameSite') ? { sameSite: 'unspecified' } : {}) })
      await setDomainLocalStorage(browser, LOCAL_STORAGE_URL, localStorage)
      const listenerDisposers = new Set()
      const attach = async (target) => {
        const dispose = await attachPageListener(target, taskReporter)
        if (typeof dispose === 'function') listenerDisposers.add(dispose)
      }
      const reportListenerFailure = (error) => taskReporter.emit('task.progress', {
        state: 'listener-failed', code: error?.code ?? 'BROWSER_LISTENER_FAILED', message: error?.message ?? String(error)
      })
      browser.on?.('targetcreated', (target) => { void attach(target).catch(reportListenerFailure) })
      browser.once?.('disconnected', () => {
        for (const dispose of listenerDisposers) dispose()
        listenerDisposers.clear()
        taskReporter.emit('task.progress', { state: 'browser-closed' })
      })
      for (const existingPage of await browser.pages()) await attach({ page: async () => existingPage })
      browser.on?.('targetdestroyed', async () => {
        if ((await browser.pages()).length === 0) await browser.close().catch(() => {})
      })
      aborted(signal)
      const mainPage = await browser.newPage()
      await page.close()
      await mainPage.goto(url, { timeout: 0 })
      aborted(signal)
      taskReporter.emit('task.progress', { state: 'page-opened', url: mainPage.url() })
    } catch (error) {
      if (bossBrowser === browser) bossBrowser = undefined
      await browser.close().catch(() => {})
      throw error
    } finally {
      removeAbortClose()
    }
  }

  async function openBossPage(url) {
    if (!bossBrowser) throw Object.assign(new Error('Boss browser is not open'), { code: 'BROWSER_UNAVAILABLE' })
    const page = await bossBrowser.newPage()
    await page.goto(url)
    return page
  }

  async function close() {
    await Promise.allSettled([...browsers].map((browser) => browser.close()))
    browsers.clear()
    bossBrowser = undefined
    await notifyIdle()
  }

  async function saveSession({ cookies, localStorage } = {}) {
    const existing = await storage.readSession()
    const pairedLocalStorage = localStorage === undefined ? existing?.localStorage ?? {} : localStorage
    await storage.writeSession({ cookies, localStorage: pairedLocalStorage })
    return storage.readSession()
  }

  async function invalidateSession() {
    await storage.invalidateSession()
  }

  return { openLogin, openBoss, openBossPage, readSession: () => storage.readSession(), saveSession, invalidateSession, close }
}
