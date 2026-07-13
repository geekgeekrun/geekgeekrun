import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createGgrClient } from '@geekgeekrun/ggr-client'
import { createBackendServer } from '../server.mjs'
import { createRuntimePaths } from '../lib/runtime-paths.mjs'
import { createConfigService } from '../lib/services/config-service.mjs'
import { createLogger } from '../lib/logger.mjs'

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-'))
const runtimePaths = createRuntimePaths(tempHome)
await fs.mkdir(runtimePaths.storageDir, { recursive: true })
await fs.writeFile(path.join(runtimePaths.storageDir, 'hr-reply-approval-queue.json'), JSON.stringify([
  { id: 'approval-one', status: 'pending' },
  { id: 'approval-two', status: 'pending' }
]))
const taskChildren = []
const cancelledBrowserTasks = []
const openedBossUrls = []
const savedExecutables = []
const backend = await createBackendServer({
  socketPath: runtimePaths.backendSocket,
  version: '0.1.0',
  runtimePaths,
  services: {
    workerEntries: { auto: '/tmp/auto.mjs' },
    spawnProcess: () => {
      const child = new EventEmitter()
      child.pid = 700 + taskChildren.length
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = (signal) => { queueMicrotask(() => child.emit('exit', null, signal)); return true }
      taskChildren.push(child)
      return child
    },
    stopTimeoutMs: 10,
    browser: {
      async openBoss({ url }) { openedBossUrls.push(url); return { taskId: 'boss-task', state: 'starting' } },
      async prepare() { return { taskId: 'prepare-task', state: 'starting' } },
      async getAvailable(options) { return { browser: 'test', executablePath: '/tmp/test-browser', options } },
      async setExecutable(value) { savedExecutables.push(value); return { browser: value.browser, executablePath: value.executablePath } },
      async cancel(taskId) { cancelledBrowserTasks.push(taskId); return { taskId, state: 'cancelled' } },
      async close() {}
    }
  }
})

try {
  await backend.start()
  const client = createGgrClient({
    socketPath: runtimePaths.backendSocket,
    client: 'test',
    clientVersion: '1.0.0'
  })
  await client.connect()
  const events = []
  client.onEvent((event) => events.push(event))

  assert.deepEqual(await client.request('system.health'), {
    ready: true,
    version: '0.1.0',
    protocolVersion: 1
  })
  await client.request('config.write', {
    resource: 'opening_message',
    patch: { openingMessage: 'hello', nested: { password: 'hidden', safe: 'shown' } }
  })
  const config = await client.request('config.read', { resource: 'opening_message' })
  assert.equal(config.data.openingMessage, 'hello')
  assert.equal(config.data.nested.password, '[redacted]')
  assert.equal(config.data.nested.safe, 'shown')
  assert.equal((await fs.stat(path.join(runtimePaths.configDir, 'boss.json'))).mode & 0o777, 0o600)

  await client.request('config.write', {
    resource: 'resumes',
    patch: [{ name: '默认简历', content: { name: 'Test User' } }]
  })
  assert.equal((await client.request('config.read', { resource: 'resumes' })).data[0].name, '默认简历')
  await client.request('config.write', { resource: 'boss_cookies', patch: [{ name: 'session', value: 'secret' }] })
  assert.deepEqual((await client.request('config.read', { resource: 'boss_cookies' })).data, {
    configured: true,
    cookieCount: 1
  })
  await client.request('config.write', {
    resource: 'llm_config',
    patch: [{ id: 'primary', providerApiSecret: 'keep-this-secret', providerCompleteApiUrl: 'https://llm.test' }]
  })
  const redactedLlmConfig = await client.request('config.read', { resource: 'llm_config' })
  assert.equal(redactedLlmConfig.data[0].providerApiSecret, '[redacted]')
  await client.request('config.write', { resource: 'llm_config', patch: redactedLlmConfig.data })
  assert.equal(
    JSON.parse(await fs.readFile(path.join(runtimePaths.configDir, 'llm.json'), 'utf8'))[0].providerApiSecret,
    'keep-this-secret'
  )
  await client.request('config.write', {
    resource: 'llm_config',
    patch: [{ ...redactedLlmConfig.data[0], providerApiSecret: 'replacement-secret' }]
  })
  assert.equal(
    JSON.parse(await fs.readFile(path.join(runtimePaths.configDir, 'llm.json'), 'utf8'))[0].providerApiSecret,
    'replacement-secret'
  )
  const prompt = await client.request('config.read', { resource: 'auto_reminder_rechat_template' })
  assert.match(prompt.data, /__REPLACE_REAL_RESUME_HERE__/)
  const defaultPrompt = await client.request('config.read', { resource: 'auto_reminder_open_template_default' })
  assert.equal(defaultPrompt.writable, false)
  assert.match(defaultPrompt.data, /开场白/)
  for (const [resource, property] of [
    ['job_filter_conditions', 'salaryList'],
    ['industry_filter_exemptions', 'length'],
    ['city_groups', 'zpData']
  ]) {
    const response = await client.request('config.read', { resource })
    assert.equal(response.writable, false)
    assert.ok(response.data[property] !== undefined)
    await assert.rejects(client.request('config.write', { resource, patch: {} }), { code: 'INVALID_PARAMS' })
  }
  const filterConditions = await client.request('config.read', { resource: 'job_filter_conditions' })
  assert.deepEqual(Object.keys(filterConditions.data).sort(), ['degreeList', 'experienceList', 'salaryList', 'scaleList'])
  for (const list of Object.values(filterConditions.data)) {
    for (const option of list) assert.deepEqual(Object.keys(option).sort(), ['code', 'name'])
  }
  const industryExemptions = await client.request('config.read', { resource: 'industry_filter_exemptions' })
  for (const group of industryExemptions.data) {
    assert.deepEqual(Object.keys(group).sort(), ['code', 'name', 'subLevelModelList'])
    for (const option of group.subLevelModelList) assert.deepEqual(Object.keys(option).sort(), ['code', 'name'])
  }
  const cityGroups = await client.request('config.read', { resource: 'city_groups' })
  assert.deepEqual(Object.keys(cityGroups.data), ['zpData'])
  assert.deepEqual(Object.keys(cityGroups.data.zpData).sort(), ['cityGroup', 'hotCityList'])
  for (const city of cityGroups.data.zpData.hotCityList) assert.deepEqual(Object.keys(city).sort(), ['code', 'name'])
  for (const group of cityGroups.data.zpData.cityGroup) {
    assert.deepEqual(Object.keys(group).sort(), ['cityList', 'firstChar'])
    for (const city of group.cityList) assert.deepEqual(Object.keys(city).sort(), ['code', 'name'])
  }

  for (const resource of ['../boss.json', 'boss.json', '/tmp/boss.json']) {
    await assert.rejects(client.request('config.read', { resource }), { code: 'INVALID_PARAMS' })
  }
  await assert.rejects(
    client.request('config.write', { resource: 'runtime_status', patch: {} }),
    { code: 'INVALID_PARAMS' }
  )

  assert.deepEqual(await client.request('task.list'), [])
  assert.deepEqual(await client.request('browser.openBoss', { url: 'https://www.zhipin.com/job_detail/job-1.html' }), { taskId: 'boss-task', state: 'starting' })
  assert.deepEqual(openedBossUrls, ['https://www.zhipin.com/job_detail/job-1.html'])
  await assert.rejects(client.request('browser.openBoss', { url: '' }), { code: 'INVALID_PARAMS' })
  assert.deepEqual(await client.request('browser.prepare'), { taskId: 'prepare-task', state: 'starting' })
  await assert.rejects(client.request('browser.prepare', { unexpected: true }), { code: 'INVALID_PARAMS' })
  assert.deepEqual(await client.request('browser.getAvailable', { ignoreCached: true }), {
    browser: 'test', executablePath: '/tmp/test-browser', options: { ignoreCached: true }
  })
  assert.deepEqual(await client.request('browser.setExecutable', { executablePath: '/tmp/custom-browser', browser: 'Custom' }), {
    browser: 'Custom', executablePath: '/tmp/custom-browser'
  })
  assert.deepEqual(savedExecutables, [{ executablePath: '/tmp/custom-browser', browser: 'Custom' }])
  await assert.rejects(client.request('browser.setExecutable', { browser: 'Custom' }), { code: 'INVALID_PARAMS' })
  assert.deepEqual(await client.request('browser.cancel', { taskId: 'browser-task' }), { taskId: 'browser-task', state: 'cancelled' })
  assert.deepEqual(cancelledBrowserTasks, ['browser-task'])
  await assert.rejects(client.request('browser.cancel', {}), { code: 'INVALID_PARAMS' })
  await assert.rejects(client.request('browser.cancel', { taskId: 'browser-task', extra: true }), { code: 'INVALID_PARAMS' })
  for (const forbidden of ['command', 'args', 'cwd', 'env']) {
    await assert.rejects(
      client.request('task.start', { workerId: 'auto', [forbidden]: 'forbidden' }),
      { code: 'INVALID_PARAMS' }
    )
  }
  await assert.rejects(
    client.request('task.start', { workerId: 'auto', options: { command: '/bin/sh' } }),
    { code: 'INVALID_PARAMS' }
  )
  const task = await client.request('task.start', { workerId: 'auto' })
  assert.equal(task.pid, 700)
  taskChildren[0].stdout.emit('data', 'token=do-not-log\nready\n')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal((await client.request('task.list'))[0].recentStdout[0], 'token=[redacted]')
  assert(events.some(({ event, data }) => event === 'task.progress' && data.line === 'token=[redacted]'))
  await client.request('task.stop', { workerId: 'auto' })
  assert(events.some(({ event }) => event === 'task.exited'))

  assert.equal((await client.request('approval.list')).length, 2)
  const createdApproval = await client.request('approval.create', {
    request: { id: 'approval-three', latestHrMessage: 'Can you confirm?', status: 'pending' }
  })
  assert.equal(createdApproval.created, true)
  assert.equal(createdApproval.request.id, 'approval-three')
  assert.equal((await client.request('approval.create', {
    request: { id: 'ignored-id', latestHrMessage: 'Can you confirm?', status: 'pending' }
  })).created, false)
  const createdApprovalEvents = events.filter(({ event, data }) => event === 'approval.required' && data.id === 'approval-three')
  assert.equal(createdApprovalEvents.length, 1)
  assert.equal((await client.request('approval.approve', { id: 'approval-one' })).status, 'approved_auto_reply')
  assert.equal((await client.request('approval.requireHuman', { id: 'approval-two', reason: 'review' })).status, 'human_required')
  assert(events.some(({ event, data }) => event === 'approval.required' && data.id === 'approval-two'))

  await client.close()
  await backend.stop()
  await assert.rejects(fs.lstat(runtimePaths.backendSocket), { code: 'ENOENT' })

  const log = await fs.readFile(runtimePaths.backendLog, 'utf8')
  const records = log.trim().split('\n').map(JSON.parse)
  assert(records.some(({ correlationId }) => typeof correlationId === 'string' && correlationId.length > 0))
  assert(!log.includes('hidden'))
  assert(!log.includes('do-not-log'))
  assert.equal((await fs.stat(runtimePaths.backendLog)).mode & 0o777, 0o600)

} finally {
  await backend.stop().catch(() => {})
  await fs.rm(tempHome, { recursive: true, force: true })
}

{
  const logHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-logger-concurrency-'))
  const logPath = path.join(logHome, 'backend.jsonl')
  const logger = await createLogger({ filePath: logPath, maxBytes: 180 })
  try {
    await logger.write('info', 'prefill', { value: 'x'.repeat(80) })
    const settled = await Promise.allSettled([
      logger.write('info', 'concurrent-one', { value: 'a'.repeat(80) }),
      logger.write('info', 'concurrent-two', { value: 'b'.repeat(80) })
    ])
    assert(settled.every(({ status }) => status === 'fulfilled'))
    await logger.close()
    for (const target of [logPath, `${logPath}.1`]) {
      const content = await fs.readFile(target, 'utf8')
      for (const line of content.trim().split('\n').filter(Boolean)) JSON.parse(line)
      assert.equal((await fs.stat(target)).mode & 0o777, 0o600)
    }
  } finally {
    await logger.close().catch(() => {})
    await fs.rm(logHome, { recursive: true, force: true })
  }
}

{
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-config-concurrency-'))
  const service = createConfigService({ configDir: configHome })
  try {
    await Promise.all([
      service.write({ resource: 'opening_message', patch: { openingMessage: 'one' } }),
      service.write({ resource: 'reply_policy', patch: { replyPolicy: 'two' } })
    ])
    const data = JSON.parse(await fs.readFile(path.join(configHome, 'boss.json'), 'utf8'))
    assert.deepEqual(data, { openingMessage: 'one', replyPolicy: 'two' })
  } finally {
    await fs.rm(configHome, { recursive: true, force: true })
  }
}

{
  const cleanupHome = await fs.mkdtemp('/tmp/ggr-cleanup-')
  const paths = createRuntimePaths(cleanupHome)
  const calls = []
  const cleanupBackend = await createBackendServer({
    socketPath: paths.backendSocket,
    version: '0.1.0',
    runtimePaths: paths,
    services: {
      task: { list: () => [], stopAll: async () => { calls.push('task') } },
      approval: {},
      browser: { close: async () => { calls.push('browser'); throw new Error('browser close failed') } },
      records: { close: async () => { calls.push('records') } },
      config: { close: async () => { calls.push('config') } },
      logger: { write: async () => {}, close: async () => { calls.push('logger') } }
    }
  })
  try {
    await cleanupBackend.start()
    await assert.rejects(cleanupBackend.stop(), /browser close failed/)
    assert.deepEqual(calls, ['task', 'browser', 'records', 'config', 'logger'])
    await assert.rejects(fs.lstat(paths.backendSocket), { code: 'ENOENT' })
  } finally {
    await cleanupBackend.stop().catch(() => {})
    await fs.rm(cleanupHome, { recursive: true, force: true })
  }
}

{
  const cleanupHome = await fs.mkdtemp('/tmp/ggr-aggregate-')
  const paths = createRuntimePaths(cleanupHome)
  const calls = []
  const cleanupBackend = await createBackendServer({
    socketPath: paths.backendSocket,
    version: '0.1.0',
    runtimePaths: paths,
    services: {
      task: { list: () => [], stopAll: async () => { calls.push('task') } },
      approval: {},
      browser: { close: async () => { calls.push('browser'); throw new Error('browser close failed') } },
      records: { close: async () => { calls.push('records'); throw new Error('records close failed') } },
      config: { close: async () => { calls.push('config') } },
      logger: { write: async () => {}, close: async () => { calls.push('logger') } }
    }
  })
  try {
    await cleanupBackend.start()
    await assert.rejects(cleanupBackend.stop(), (error) => {
      assert(error instanceof AggregateError)
      assert.deepEqual(error.errors.map(({ message }) => message), ['browser close failed', 'records close failed'])
      return true
    })
    assert.deepEqual(calls, ['task', 'browser', 'records', 'config', 'logger'])
    await assert.rejects(fs.lstat(paths.backendSocket), { code: 'ENOENT' })
  } finally {
    await cleanupBackend.stop().catch(() => {})
    await fs.rm(cleanupHome, { recursive: true, force: true })
  }
}

{
  const delayedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-peer-'))
  const paths = createRuntimePaths(delayedHome)
  const delayedBackend = await createBackendServer({
    socketPath: paths.backendSocket,
    version: '0.1.0',
    runtimePaths: paths,
    verifyPeer: () => new Promise((resolve) => setTimeout(() => resolve(true), 30))
  })
  try {
    await delayedBackend.start()
    const client = createGgrClient({ socketPath: paths.backendSocket, client: 'test', clientVersion: '1.0.0', requestTimeoutMs: 200 })
    await client.connect()
    await client.close()
  } finally {
    await delayedBackend.stop()
    await fs.rm(delayedHome, { recursive: true, force: true })
  }
}

console.log('ggr backend server check passed')
