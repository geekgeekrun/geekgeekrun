import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createBrowserService } from '../lib/services/browser-service.mjs'
import { createBossPageListener } from '../lib/services/browser/boss-page-listener.mjs'
import { createBrowserStorage } from '../lib/services/browser/storage.mjs'
import { createBackendBrowserRuntime } from '../lib/services/browser/runtime.mjs'
import { createBrowserHistory } from '../lib/services/browser/dependencies/browser-history.mjs'
import { createPuppeteerDependencies } from '../lib/services/browser/dependencies/puppeteer-executable.mjs'

const tick = () => new Promise((resolve) => setImmediate(resolve))
const until = async (predicate, message) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return
    await tick()
  }
  throw new Error(message)
}
const cookie = { name: 'wt2', value: 'token', domain: '.zhipin.com', path: '/', secure: true, session: true, httpOnly: true }

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-browser-'))
const storageDir = path.join(tempHome, 'storage')
const storage = createBrowserStorage({ storageDir })
await storage.writeSession({ cookies: [cookie], localStorage: { identity: 'geek' } })
assert.deepEqual(await storage.readCookies(), [cookie], 'Cookie persistence must round-trip')
assert.deepEqual(await storage.readLocalStorage(), { identity: 'geek' }, 'local storage persistence must round-trip')
assert.deepEqual(
  JSON.parse(await fs.readFile(path.join(storageDir, 'boss-session.json'), 'utf8')),
  { cookies: [cookie], localStorage: { identity: 'geek' } },
  'Cookies and local storage must have one atomic backend-owned session record'
)
await assert.rejects(storage.writeSession({ cookies: [{ name: 'broken' }], localStorage: {} }), { code: 'COOKIE_INVALID' })
assert.deepEqual(await storage.readCookies(), [cookie], 'invalid Cookies must not replace the last valid file')
assert.equal((await fs.stat(path.join(storageDir, 'boss-cookies.json'))).mode & 0o777, 0o600)

{
  const executablePath = path.join(tempHome, 'chrome')
  await fs.writeFile(executablePath, '')
  const history = createBrowserHistory({ storageDir })
  await history.write({ browser: 'chrome', executablePath })
  assert.deepEqual(await history.read(), { browser: 'chrome', executablePath })
  await fs.rm(executablePath)
  assert.equal(await history.read(), null, 'stale executable history must be removed')
}

{
  let confirmationCalls = 0
  let installCalls = 0
  const dependencies = createPuppeteerDependencies({
    browser: 'chrome', cacheDir: tempHome, buildId: '1',
    browserManager: {
      computeExecutablePath: () => '/cached/chrome',
      getInstalledBrowsers: async () => [{ browser: 'chrome', buildId: '1', executablePath: '/cached/chrome' }],
      install: async () => { installCalls++; return { browser: 'chrome', executablePath: '/downloaded/chrome' } }
    }
  })
  assert.deepEqual(await dependencies.ensure({ confirm: async () => { confirmationCalls++ } }), {
    browser: 'chrome', executablePath: '/cached/chrome'
  })
  assert.equal(confirmationCalls, 0, 'an already downloaded browser must not prompt again')
  assert.equal(installCalls, 0, 'an already downloaded browser must not be reinstalled')
}

class FakePage extends EventEmitter {
  constructor(url = 'about:blank') { super(); this.currentUrl = url; this.gotos = []; this.cookiesSet = [] }
  url() { return this.currentUrl }
  async goto(url) { this.currentUrl = url; this.gotos.push(url) }
  async setCookie(value) { this.cookiesSet.push(value) }
  async cookies() { return [cookie] }
  async evaluate(expression) {
    if (String(expression).includes('localStorage')) return { identity: 'captured' }
    return this.evaluations?.[expression]
  }
  async close() { this.closed = true; this.emit('close') }
}

class FakeBrowser extends EventEmitter {
  constructor(page = new FakePage()) { super(); this.pageList = [page]; this.created = [] }
  async pages() { return this.pageList }
  async newPage() { const page = new FakePage(); this.pageList.push(page); this.created.push(page); return page }
  async close() { this.closed = (this.closed ?? 0) + 1; this.emit('disconnected') }
}

{
  const page = new FakePage()
  page.waitForResponse = async (predicate) => {
    assert.equal(predicate({ url: () => 'https://www.zhipin.com/wapi/zppassport/qrcode/dispatcher' }), true)
    return {}
  }
  page.waitForNavigation = async () => {}
  page.$ = async () => null
  const browser = new FakeBrowser(page)
  const events = []
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir }, storage,
    launchBrowser: async (options) => { assert.deepEqual(options.enableExtensions, ['/tmp/edit-this-cookie']); return browser },
    ensureExtension: async () => '/tmp/edit-this-cookie', blockPageNavigation: async () => ({ dispose() {} }),
    sleep: async () => {}, setDomainLocalStorage: async () => {}, records: {}
  })
  await runtime.openLogin({ taskId: 'login', taskReporter: { emit: (event, data) => events.push({ event, data }) } })
  assert.equal(browser.closed, 1, 'successful login must close its browser')
  assert.deepEqual(await storage.readLocalStorage(), { identity: 'captured' })
  assert.ok(events.some(({ event, data }) => event === 'task.progress' && data.state === 'cookie-collected'))
}

{
  const calls = []
  const page = new FakePage('https://www.zhipin.com/web/geek/jobs')
  page.evaluations = {
    'document.querySelector(".job-detail-box").__vue__.data': { securityId: 'security', jobInfo: { encryptId: 'job-1' }, bossInfo: {} },
    'document.querySelector(".job-detail-box").__vue__.$store.state.userInfo': { encryptUserId: 'user-1' }
  }
  createBossPageListener({
    page,
    storage: { async readReasonCache() { return {} }, async writeReasonCache(value) { calls.push(['reasons', value]) } },
    records: {
      async saveJobInfo(value) { calls.push(['job', value]) },
      async saveHireStatus(value) { calls.push(['hire', value]) }
    },
    reporter: { emit() {} }
  })
  page.emit('response', {
    url: () => 'https://www.zhipin.com/wapi/zpgeek/job/detail.json',
    json: async () => ({ code: 0, zpData: { jobInfo: { encryptId: 'job-1' } } })
  })
  await until(() => calls.length === 2, 'job detail listener did not save records')
  assert.equal(calls[0][0], 'job', 'job detail response must update records')
  assert.deepEqual(calls[1][1], { encryptJobId: 'job-1', hireStatus: 1 })
}

{
  const calls = []
  const page = new FakePage('https://www.zhipin.com/job_detail/job-closed.html')
  page.waitForFunction = async () => {}
  page.content = async () => '<main id="main"><div class="job-banner"><span class="job-status">职位已关闭</span></div></main>'
  createBossPageListener({ page, storage: {}, records: { async saveHireStatus(value) { calls.push(value) } } })
  await until(() => calls.length === 1, 'closed job listener did not save its status')
  assert.deepEqual(calls[0], { encryptJobId: 'job-closed', hireStatus: 2 }, 'job detail pages must preserve closed-position updates')
}

{
  const firstPage = new FakePage()
  const browser = new FakeBrowser(firstPage)
  const attached = []
  let idleCloses = 0
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir }, storage,
    launchBrowser: async () => browser, ensureExtension: async () => '/tmp/extension',
    setDomainLocalStorage: async (_browser, url, value) => assert.deepEqual([url, value], ['https://www.zhipin.com/desktop/', { identity: 'captured' }]),
    attachPageListener: async (target) => attached.push(target), records: {}, onIdle: async () => { idleCloses++ }
  })
  await runtime.openBoss({ taskId: 'boss', taskReporter: { emit() {} } })
  const target = { page: async () => new FakePage() }
  browser.emit('targetcreated', target)
  await tick()
  assert.equal(attached.at(-1), target, 'newly opened pages must receive record listeners')
  const opened = await runtime.openBossPage('https://www.zhipin.com/job_detail/job-2.html')
  assert.equal(opened.gotos[0], 'https://www.zhipin.com/job_detail/job-2.html')
  await runtime.close()
  assert.equal(browser.closed, 1, 'backend shutdown must close Boss browsers')
  assert.equal(idleCloses, 1, 'an idle compatibility runtime must release its records connection')
}

{
  const page = new FakePage()
  page.goto = async () => { throw Object.assign(new Error('navigation failed'), { code: 'NAVIGATION_FAILED' }) }
  const browser = new FakeBrowser(page)
  browser.newPage = async () => page
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir }, storage,
    launchBrowser: async () => browser, ensureExtension: async () => '/tmp/extension',
    setDomainLocalStorage: async () => {}, attachPageListener: async () => {}, records: {}
  })
  await assert.rejects(runtime.openBoss({ taskId: 'failing-boss', taskReporter: { emit() {} } }), { code: 'NAVIGATION_FAILED' })
  assert.equal(browser.closed, 1, 'a failed Boss navigation must close its browser')
}

{
  let rejectOperation
  let operationSignal
  let closes = 0
  const events = []
  const service = createBrowserService({
    createTaskId: () => 'task-one', emit: (event, data) => events.push({ event, data }),
    runtime: {
      async openBoss({ onBrowserOpened, signal }) {
        operationSignal = signal
        onBrowserOpened({ async close() { closes++ } })
        await new Promise((_resolve, reject) => { rejectOperation = reject })
      }
    }
  })
  assert.deepEqual(service.openBoss(), { taskId: 'task-one', state: 'starting' })
  await tick()
  await service.cancel('task-one')
  assert.equal(operationSignal.aborted, true, 'cancel must reach the backend runtime cooperatively')
  rejectOperation(Object.assign(new Error('cancelled'), { code: 'TASK_CANCELLED' }))
  await tick()
  assert.equal(closes, 1, 'cancel must close the operation browser')
  assert.equal(service.getTask('task-one').state, 'cancelled')
  assert.ok(events.every(({ event }) => event === 'task.progress'), 'browser operations emit only validated structured task events')
}

{
  let browserCloses = 0
  let runtimeCloses = 0
  const service = createBrowserService({
    createTaskId: () => 'shutdown-task',
    runtime: {
      async openBoss({ onBrowserOpened }) {
        onBrowserOpened({ async close() { browserCloses++ } })
        await new Promise(() => {})
      },
      async close() { runtimeCloses++ }
    }
  })
  service.openBoss()
  await tick()
  await service.close()
  assert.equal(browserCloses, 1, 'backend shutdown must close a browser still opening')
  assert.equal(runtimeCloses, 1, 'backend shutdown must close the shared runtime')
}

for (const file of [
  'packages/ui/src/main/flow/LAUNCH_BOSS_ZHIPIN_LOGIN_PAGE_WITH_PRELOAD_EXTENSION.ts',
  'packages/ui/src/main/flow/LAUNCH_BOSS_SITE/index.ts',
  'packages/ui/src/main/flow/DOWNLOAD_DEPENDENCIES/utils/browser-history.ts',
  'packages/ui/src/main/flow/DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index.ts'
]) {
  const source = await fs.readFile(new URL(`../../../${file}`, import.meta.url), 'utf8')
  assert.match(source, /ggr-backend/, `${file} must delegate to backend-owned code`)
  assert.doesNotMatch(source, /electron|initDb|puppeteer\.launch|saveJobInfoFromRecommendPage|process\.exit/, `${file} must be a thin compatibility wrapper`)
}

for (const file of [
  'packages/ggr-backend/lib/services/browser/runtime.mjs',
  'packages/ggr-backend/lib/services/browser/extension.mjs',
  'packages/ggr-backend/lib/services/browser/boss-page-listener.mjs',
  'packages/ggr-backend/lib/services/browser/records.mjs',
  'packages/ggr-backend/lib/services/browser/dependencies/default-dependencies.mjs'
]) {
  const source = await fs.readFile(new URL(`../../../${file}`, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]electron['"]|--mode|process\.exit|process\.argv/, `${file} must remain backend-owned and Electron-free`)
}

const compatibilitySource = await fs.readFile(new URL('../../../packages/ggr-backend/lib/services/browser/compat.mjs', import.meta.url), 'utf8')
assert.match(compatibilitySource, /createBrowserService/, 'compatibility calls must retain backend task IDs and states')
assert.doesNotMatch(compatibilitySource, /runtime\.open(?:Login|Boss)/, 'compatibility calls must not bypass backend task ownership')

console.log('ggr backend browser service check passed')
