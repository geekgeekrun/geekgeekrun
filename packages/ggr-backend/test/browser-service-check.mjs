import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createBrowserService } from '../lib/services/browser-service.mjs'
import { createBossPageListener } from '../lib/services/browser/boss-page-listener.mjs'
import { createBrowserStorage } from '../lib/services/browser/storage.mjs'
import { createBackendBrowserRuntime } from '../lib/services/browser/runtime.mjs'
import { createBrowserHistory } from '../lib/services/browser/dependencies/browser-history.mjs'
import { createPuppeteerDependencies } from '../lib/services/browser/dependencies/puppeteer-executable.mjs'
import { createBrowserCompatibilityBridge } from '../lib/services/browser/compat.mjs'
import { readAuthoritativeSession } from '../lib/workers/read-no-reply/runtime.mjs'
import { METHODS } from '@geekgeekrun/ggr-protocol'

const tick = () => new Promise((resolve) => setImmediate(resolve))
const until = async (predicate, message) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(message)
}
const cookie = { name: 'wt2', value: 'token', domain: '.zhipin.com', path: '/', secure: true, session: true, httpOnly: true }
const browserInfo = { browser: 'test chrome', executablePath: '/tmp/test-chrome' }
const dependencies = { async discover() { return browserInfo } }

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-browser-'))
const storageDir = path.join(tempHome, 'storage')
const storage = createBrowserStorage({ storageDir })

{
  const legacyStorageDir = path.join(tempHome, 'legacy-storage')
  await fs.mkdir(legacyStorageDir, { recursive: true })
  await fs.writeFile(path.join(legacyStorageDir, 'boss-cookies.json'), JSON.stringify([cookie]))
  await fs.writeFile(path.join(legacyStorageDir, 'boss-local-storage.json'), JSON.stringify({ identity: 'legacy' }))
  const legacyStorage = createBrowserStorage({ storageDir: legacyStorageDir })
  assert.deepEqual(await legacyStorage.readSession(), { cookies: [cookie], localStorage: { identity: 'legacy' } },
    'valid legacy mirrors must migrate into one authoritative session snapshot')
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(legacyStorageDir, 'boss-session.json'), 'utf8')),
    { cookies: [cookie], localStorage: { identity: 'legacy' } },
    'legacy migration must atomically persist the paired authoritative session')
}

{
  const invalidLegacyStorageDir = path.join(tempHome, 'invalid-legacy-storage')
  await fs.mkdir(invalidLegacyStorageDir, { recursive: true })
  await fs.writeFile(path.join(invalidLegacyStorageDir, 'boss-cookies.json'), JSON.stringify([{ name: 'broken' }]))
  const invalidLegacyStorage = createBrowserStorage({ storageDir: invalidLegacyStorageDir })
  assert.equal(await invalidLegacyStorage.readSession(), null, 'invalid legacy cookies must not become an authoritative session')
  await assert.rejects(fs.access(path.join(invalidLegacyStorageDir, 'boss-session.json')), { code: 'ENOENT' })
}

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
    dependencies,
    launchBrowser: async (options) => { assert.deepEqual(options, { headless: false, pipe: true, executablePath: browserInfo.executablePath, enableExtensions: ['/tmp/edit-this-cookie'] }); return browser },
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
    dependencies,
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
    dependencies,
    launchBrowser: async () => browser, ensureExtension: async () => '/tmp/extension',
    setDomainLocalStorage: async () => {}, attachPageListener: async () => {}, records: {}
  })
  await assert.rejects(runtime.openBoss({ taskId: 'failing-boss', taskReporter: { emit() {} } }), { code: 'NAVIGATION_FAILED' })
  assert.equal(browser.closed, 1, 'a failed Boss navigation must close its browser')
}

{
  const browser = new FakeBrowser(new FakePage())
  const session = { cookies: [cookie], localStorage: { identity: 'atomic' } }
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir }, dependencies,
    storage: {
      async readSession() { return session },
      async readCookies() { throw new Error('must not mix session generations') },
      async readLocalStorage() { throw new Error('must not mix session generations') }
    },
    launchBrowser: async () => browser, ensureExtension: async () => '/tmp/extension',
    setDomainLocalStorage: async (_browser, _url, value) => assert.equal(value, session.localStorage),
    attachPageListener: async () => {}, records: {}
  })
  await runtime.openBoss({ taskId: 'atomic-session', taskReporter: { emit() {} } })
  assert.deepEqual(browser.pageList[0].cookiesSet, [{ ...cookie }], 'Boss restore must use one authoritative session snapshot')
  await runtime.close()
}

{
  const manualStorageDir = path.join(tempHome, 'manual-session-storage')
  const manualStorage = createBrowserStorage({ storageDir: manualStorageDir })
  await manualStorage.writeSession({ cookies: [{ ...cookie, value: 'old-token' }], localStorage: { identity: 'preserved' } })
  const browser = new FakeBrowser(new FakePage())
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir: manualStorageDir }, storage: manualStorage, dependencies,
    launchBrowser: async () => browser, ensureExtension: async () => '/tmp/extension',
    setDomainLocalStorage: async (_browser, _url, localStorage) => assert.deepEqual(localStorage, { identity: 'preserved' }),
    attachPageListener: async () => {}, records: {}
  })
  const bridge = createBrowserCompatibilityBridge({ runtime })
  await bridge.saveSession({ cookies: [{ ...cookie, value: 'manual-token' }] })
  await runtime.openBoss({ taskId: 'manual-session', taskReporter: { emit() {} } })
  assert.deepEqual(browser.pageList[0].cookiesSet, [{ ...cookie, value: 'manual-token' }],
    'a manual Cookie Assistant save must create a session that Boss can restore')
  await runtime.close()
  await bridge.invalidateSession()
  await assert.rejects(runtime.openBoss({ taskId: 'invalidated-session', taskReporter: { emit() {} } }), { code: 'COOKIE_INVALID' })
  await assert.rejects(readAuthoritativeSession(manualStorage), { code: 'COOKIE_INVALID' })
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(manualStorageDir, 'boss-cookies.json'), 'utf8')), [],
    'session invalidation must clear the compatibility cookie mirror too')
  await bridge.close()
}

{
  let launches = 0
  const runtime = createBackendBrowserRuntime({
    runtimePaths: { storageDir }, dependencies: { async discover() { return null } }, storage,
    launchBrowser: async () => { launches++ }, ensureExtension: async () => '/tmp/extension', records: {}
  })
  await assert.rejects(runtime.openLogin({ taskReporter: { emit() {} } }), { code: 'BROWSER_EXECUTABLE_UNAVAILABLE' })
  assert.equal(launches, 0, 'runtime must reject a missing executable before launching Puppeteer')
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

assert.equal(METHODS.BROWSER_CANCEL, 'browser.cancel', 'browser cancellation must be exposed through the protocol')

{
  const output = new PassThrough()
  const input = new PassThrough()
  const messages = []
  output.on('data', (chunk) => messages.push(...chunk.toString().trim().split('\n').filter(Boolean).map(JSON.parse)))
  let openedUrl
  let runtimeClosed = 0
  const bridge = createBrowserCompatibilityBridge({
    input, output,
    runtime: {
      async readSession() { return { cookies: [cookie], localStorage: {} } },
      async openLogin({ taskReporter }) { taskReporter.emit('task.progress', { state: 'cookie-collected' }) },
      async openBoss({ taskReporter }) { taskReporter.emit('task.progress', { state: 'page-opened' }) },
      async openBossPage(url) { openedUrl = url },
      async close() { runtimeClosed++ }
    }
  })
  bridge.startLogin()
  bridge.startBoss()
  await until(() => messages.some(({ type }) => type === 'BOSS_ZHIPIN_COOKIE_COLLECTED') && messages.some(({ type }) => type === 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY'), 'bridge did not retain legacy fd3 notifications')
  const payload = JSON.stringify({ type: 'NEW_WINDOW', url: 'https://www.zhipin.com/job_detail/job-bridge.html' })
  input.write(payload.slice(0, 17))
  input.write(payload.slice(17))
  await until(() => openedUrl, 'bridge did not route NEW_WINDOW to backend browser service')
  assert.equal(openedUrl, 'https://www.zhipin.com/job_detail/job-bridge.html')
  await bridge.close()
  assert.equal(runtimeClosed, 1, 'bridge cleanup must close the backend runtime')
}

{
  const harness = path.join(tempHome, 'compat-bridge-harness.mjs')
  await fs.writeFile(harness, `
    import fs from 'node:fs'
    import { createBrowserCompatibilityBridge } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../lib/services/browser/compat.mjs', import.meta.url))).href)}
    const input = fs.createReadStream(null, { fd: 3, autoClose: false })
    const output = fs.createWriteStream(null, { fd: 3, autoClose: false })
    const mode = process.env.GGR_COMPAT_HARNESS_MODE
    let bridge
    const shutdown = async (reason) => {
      await bridge.close()
      output.write(JSON.stringify({ type: 'HARNESS_CLOSED', reason }) + '\\n')
    }
    bridge = createBrowserCompatibilityBridge({
      input, output,
      runtime: {
        async openBoss({ taskReporter }) {
          if (mode === 'ready') taskReporter.emit('task.progress', { state: 'page-opened' })
          if (mode === 'early') return shutdown('early-exit')
          if (mode === 'timeout') return new Promise(() => {})
        },
        async openBossPage(url) { output.write(JSON.stringify({ type: 'NEW_WINDOW_OPENED', url }) + '\\n'); await shutdown('new-window') },
        async close() {}
      }
    })
    bridge.startBoss()
    if (mode === 'timeout') setTimeout(() => { void shutdown('ready-timeout') }, 25)
  `)
  const children = []
  const startHarness = (mode) => {
    const child = spawn(process.execPath, [harness], { env: { ...process.env, GGR_COMPAT_HARNESS_MODE: mode }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
    const messages = []
    let stderr = ''
    const waiters = new Set()
    let buffer = ''
    child.stdio[3].setEncoding('utf8')
    child.stdio[3].on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line) {
          const message = JSON.parse(line)
          messages.push(message)
          for (const waiter of waiters) waiter(message)
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal, messages }))
    })
    const waitFor = (predicate, label) => new Promise((resolve, reject) => {
      if (messages.some(predicate)) return resolve()
      const timer = setTimeout(() => {
        waiters.delete(waiter)
        child.kill()
        reject(new Error(`${label}; stderr: ${stderr}`))
      }, 2000)
      const waiter = (message) => {
        if (!predicate(message)) return
        clearTimeout(timer)
        waiters.delete(waiter)
        resolve()
      }
      waiters.add(waiter)
    })
    const bridgeChild = { child, messages, exited, waitFor }
    children.push(bridgeChild)
    return bridgeChild
  }
  const terminate = async ({ child, exited }) => {
    child.stdio[3]?.end()
    if (child.exitCode !== null || child.signalCode) return exited
    child.kill('SIGTERM')
    const finished = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 250))
    ])
    if (!finished && child.exitCode === null && !child.signalCode) child.kill('SIGKILL')
    const result = await exited
    assert.ok(child.exitCode !== null || child.signalCode, 'the fd3 bridge child must not remain alive after cleanup')
    return result
  }
  const awaitExit = (bridgeChild, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not exit within 2 seconds`)), 2000)
    bridgeChild.exited.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
  try {
    const ready = startHarness('ready')
    await ready.waitFor(({ type }) => type === 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY', 'fd3 child did not announce Boss readiness')
    // The old Electron caller writes one bare JSON value to fd3, with no trailing newline.
    // Split it to prove the bridge buffers an incomplete value safely.
    const message = JSON.stringify({ type: 'NEW_WINDOW', url: 'https://www.zhipin.com/job_detail/fd3-bridge.html' })
    ready.child.stdio[3].write(message.slice(0, 11))
    ready.child.stdio[3].write(message.slice(11))
    ready.child.stdio[3].end()
    await ready.waitFor(({ type }) => type === 'HARNESS_CLOSED', 'fd3 bridge did not report cleanup')
    const readyExit = await terminate(ready)
    assert.equal(readyExit.signal, 'SIGTERM', 'fd3 bridge must terminate after parent cleanup')
    assert.deepEqual(readyExit.messages, [
      { type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY' },
      { type: 'NEW_WINDOW_OPENED', url: 'https://www.zhipin.com/job_detail/fd3-bridge.html' },
      { type: 'HARNESS_CLOSED', reason: 'new-window' }
    ])
    const earlyChild = startHarness('early')
    await earlyChild.waitFor(({ type, reason }) => type === 'HARNESS_CLOSED' && reason === 'early-exit', 'early bridge did not clean up')
    const early = await terminate(earlyChild)
    assert.equal(early.signal, 'SIGTERM', 'an early bridge exit must not leak its child')
    assert.deepEqual(early.messages, [{ type: 'HARNESS_CLOSED', reason: 'early-exit' }])
    const timeoutChild = startHarness('timeout')
    await timeoutChild.waitFor(({ type, reason }) => type === 'HARNESS_CLOSED' && reason === 'ready-timeout', 'timed bridge did not clean up')
    const timeout = await terminate(timeoutChild)
    assert.equal(timeout.signal, 'SIGTERM', 'a readiness timeout must not leak its bridge child')
    assert.deepEqual(timeout.messages, [{ type: 'HARNESS_CLOSED', reason: 'ready-timeout' }])
  } finally {
    await Promise.all(children.map(terminate))
  }
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
