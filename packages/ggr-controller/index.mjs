import { spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TASKS = Object.freeze({
  AUTO_CHAT: Object.freeze({
    workerId: 'geekAutoStartWithBossMain',
    label: '自动开聊'
  }),
  READ_NO_REPLY: Object.freeze({
    workerId: 'readNoReplyAutoReminderMain',
    label: '已读不回提醒'
  })
})

const TASK_IDS = new Set(Object.values(TASKS).map((task) => task.workerId))
const CONFIG_FILES = new Set([
  'boss.json',
  'common-job-condition-config.json',
  'target-company-list.json',
  'llm.json',
  'dingtalk.json'
])
const ARRAY_CONFIG_FILES = new Set(['target-company-list.json'])
const APP_DATA_RESOURCES = Object.freeze({
  job_intention: Object.freeze({ fileName: 'common-job-condition-config.json', writable: true }),
  opening_message: Object.freeze({ fileName: 'boss.json', writable: true }),
  reply_policy: Object.freeze({ fileName: 'boss.json', writable: true }),
  target_companies: Object.freeze({ fileName: 'target-company-list.json', writable: true, array: true }),
  blacklist_companies: Object.freeze({ fileName: 'boss.json', writable: true }),
  llm_config: Object.freeze({ fileName: 'llm.json', writable: true }),
  notification_config: Object.freeze({ fileName: 'dingtalk.json', writable: true }),
  runtime_status: Object.freeze({ type: 'runtime_status', writable: false })
})
const REDACTED_VALUE = '[redacted]'
const SENSITIVE_FIELD_PATTERN = /(apiKey|accessKey|key|token|password|webhook)/i
const RECENT_LINE_LIMIT = 80
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const APPROVAL_QUEUE_LOCK_TIMEOUT_MS = 5000
const APPROVAL_QUEUE_LOCK_STALE_MS = 30000
const APPROVAL_QUEUE_LOCK_RETRY_MS = 25
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultRepoRoot() {
  return path.resolve(__dirname, '../..')
}

function defaultApprovalQueueFilePath() {
  return path.join(os.homedir(), '.geekgeekrun', 'storage', 'hr-reply-approval-queue.json')
}

function defaultConfigDir() {
  return path.join(os.homedir(), '.geekgeekrun/config')
}

function pushLines(target, chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean)
  target.push(...lines)
  if (target.length > RECENT_LINE_LIMIT) {
    target.splice(0, target.length - RECENT_LINE_LIMIT)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMergeConfig(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch
  }
  const next = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    next[key] = isPlainObject(value) && isPlainObject(next[key]) ? deepMergeConfig(next[key], value) : value
  }
  return next
}

function redactAppData(value) {
  if (Array.isArray(value)) {
    return value.map(redactAppData)
  }
  if (!isPlainObject(value)) {
    return value
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_FIELD_PATTERN.test(key) ? REDACTED_VALUE : redactAppData(entry)
  ]))
}

function getAppDataResource(resource) {
  const definition = APP_DATA_RESOURCES[resource]
  if (!definition) {
    throw new Error(`Unsupported app data resource: ${resource}`)
  }
  return definition
}

function assertTaskId(workerId) {
  if (!TASK_IDS.has(workerId)) {
    throw new Error(`Unsupported task id: ${workerId}`)
  }
  return workerId
}

async function backupCorruptFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await fs.rename(filePath, `${filePath}.corrupt-${timestamp}.bak`).catch(() => {})
}

async function readJsonIfPresent(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback
    }
    if (error instanceof SyntaxError) {
      await backupCorruptFile(filePath)
      return fallback
    }
    throw error
  }
}

async function writePrivateJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(path.dirname(filePath), PRIVATE_DIR_MODE).catch(() => {})
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
  await fs.chmod(temporaryPath, PRIVATE_FILE_MODE).catch(() => {})
  await fs.rename(temporaryPath, filePath)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function withApprovalQueueLock(queueFilePath, operation) {
  const lockPath = `${queueFilePath}.lock`
  const deadline = Date.now() + APPROVAL_QUEUE_LOCK_TIMEOUT_MS
  let lockHandle

  await fs.mkdir(path.dirname(queueFilePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockPath, 'wx', PRIVATE_FILE_MODE)
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      const lockInfo = await fs.stat(lockPath).catch(() => null)
      if (lockInfo && Date.now() - lockInfo.mtimeMs > APPROVAL_QUEUE_LOCK_STALE_MS) {
        await fs.unlink(lockPath).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for approval queue lock: ${queueFilePath}`)
      }
      await sleep(APPROVAL_QUEUE_LOCK_RETRY_MS)
    }
  }

  try {
    return await operation()
  } finally {
    await lockHandle.close().catch(() => {})
    await fs.unlink(lockPath).catch(() => {})
  }
}

export async function updateRuntimeConfig({ fileName, patch, configDir = defaultConfigDir() }) {
  if (!CONFIG_FILES.has(fileName)) {
    throw new Error(`Unsupported config file: ${fileName}`)
  }

  if (ARRAY_CONFIG_FILES.has(fileName)) {
    if (!Array.isArray(patch)) {
      throw new Error(`${fileName} must be replaced with an array.`)
    }
  } else if (!isPlainObject(patch)) {
    throw new Error(`${fileName} patch must be an object.`)
  }

  const filePath = path.join(configDir, fileName)
  await fs.mkdir(configDir, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(configDir, PRIVATE_DIR_MODE).catch(() => {})

  const nextConfig = ARRAY_CONFIG_FILES.has(fileName)
    ? patch
    : deepMergeConfig(await readJsonIfPresent(filePath, {}), patch)

  await writePrivateJson(filePath, nextConfig)
  return { fileName, written: true }
}

export async function readAppData({ resource, configDir = defaultConfigDir() }) {
  const definition = getAppDataResource(resource)
  if (definition.type === 'runtime_status') {
    return { resource, type: definition.type, data: null }
  }
  const data = await readJsonIfPresent(path.join(configDir, definition.fileName), definition.array ? [] : {})
  return {
    resource,
    fileName: definition.fileName,
    writable: Boolean(definition.writable),
    data: redactAppData(data)
  }
}

export async function updateAppData({ resource, patch, configDir = defaultConfigDir() }) {
  const definition = getAppDataResource(resource)
  if (!definition.writable) {
    throw new Error(`App data resource is read-only: ${resource}`)
  }
  await updateRuntimeConfig({ fileName: definition.fileName, patch, configDir })
  return readAppData({ resource, configDir })
}

async function applyConfigPatch(configPatch) {
  if (!configPatch) {
    return []
  }

  if (Array.isArray(configPatch)) {
    return Promise.all(configPatch.map(updateRuntimeConfig))
  }

  if ('fileName' in configPatch) {
    return [await updateRuntimeConfig(configPatch)]
  }

  return Promise.all(Object.entries(configPatch).map(([fileName, patch]) => updateRuntimeConfig({ fileName, patch })))
}

function makeLocalSnapshot(status) {
  return {
    ...status,
    recentStdout: [...status.recentStdout],
    recentStderr: [...status.recentStderr]
  }
}

export function createLocalProcessController({ repoRoot = defaultRepoRoot(), spawnProcess = nodeSpawn } = {}) {
  let child = null
  let stopping = false
  const status = {
    running: false,
    pid: null,
    mode: 'semi_auto',
    headless: true,
    startedAt: null,
    exitedAt: null,
    exitCode: null,
    signal: null,
    lastError: null,
    recentStdout: [],
    recentStderr: []
  }

  function markChildExited(exitingChild, exitCode = null, signal = null) {
    if (child !== exitingChild) {
      return
    }
    status.running = false
    status.pid = null
    status.exitedAt = new Date().toISOString()
    status.exitCode = exitCode
    status.signal = signal
    child = null
    stopping = false
  }

  async function start({ headless = true, mode = 'semi_auto', configPatch } = {}) {
    if (child) {
      return makeLocalSnapshot(status)
    }

    const configResults = await applyConfigPatch(configPatch)
    const daemonPath = path.join(repoRoot, 'packages/run-core-of-geek-auto-start-chat-with-boss/daemon-main.mjs')

    child = spawnProcess(process.execPath, [daemonPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GGR_HEADLESS: String(Boolean(headless)),
        GGR_AGENT_MODE: mode
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const startedChild = child

    status.running = true
    status.pid = child.pid
    status.mode = mode
    status.headless = Boolean(headless)
    status.startedAt = new Date().toISOString()
    status.exitedAt = null
    status.exitCode = null
    status.signal = null
    status.lastError = null
    status.configPatch = configResults

    child.stdout?.on?.('data', (chunk) => pushLines(status.recentStdout, chunk))
    child.stderr?.on?.('data', (chunk) => pushLines(status.recentStderr, chunk))
    child.once?.('error', (error) => {
      status.lastError = error.message
      markChildExited(startedChild)
    })
    child.once?.('exit', (exitCode, signal) => markChildExited(startedChild, exitCode, signal))
    child.once?.('close', (exitCode, signal) => markChildExited(startedChild, exitCode, signal))

    return makeLocalSnapshot(status)
  }

  async function stop() {
    if (!child) {
      return makeLocalSnapshot(status)
    }

    stopping = true
    const exitingChild = child
    const exited = new Promise((resolve) => exitingChild.once?.('exit', resolve))
    exitingChild.kill('SIGTERM')

    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000))
    ])
    if (!stopped && stopping && child === exitingChild) {
      exitingChild.kill('SIGKILL')
      await exited
    }

    return makeLocalSnapshot(status)
  }

  return {
    start,
    stop,
    getStatus: () => makeLocalSnapshot(status),
    updateConfig: updateRuntimeConfig
  }
}

export function createDaemonController({ sendToDaemon, runTask }) {
  if (typeof sendToDaemon !== 'function') {
    throw new Error('sendToDaemon is required')
  }
  if (typeof runTask !== 'function') {
    throw new Error('runTask is required')
  }

  async function getWorkers() {
    const status = await sendToDaemon({ type: 'get-status' }, { needCallback: true })
    return status?.workers ?? []
  }

  async function getTaskStatus(workerId) {
    assertTaskId(workerId)
    const workers = await getWorkers()
    const worker = workers.find((it) => it.workerId === workerId)
    return {
      running: Boolean(worker),
      worker: worker ?? null,
      workers
    }
  }

  async function startTask(workerId) {
    assertTaskId(workerId)
    return runTask({ mode: workerId })
  }

  async function stopTask(workerId) {
    assertTaskId(workerId)
    return sendToDaemon({ type: 'stop-worker', workerId }, { needCallback: true })
  }

  return {
    getWorkers,
    getTaskStatus,
    startTask,
    stopTask
  }
}

export async function readApprovalQueue({ queueFilePath = defaultApprovalQueueFilePath(), includeAll = false } = {}) {
  return withApprovalQueueLock(queueFilePath, async () => {
    const queue = await readJsonIfPresent(queueFilePath, [])
    if (!Array.isArray(queue)) {
      return []
    }
    return includeAll ? queue : queue.filter((item) => item.status === 'pending')
  })
}

export async function updateApprovalQueue({ queueFilePath = defaultApprovalQueueFilePath(), updater } = {}) {
  if (typeof updater !== 'function') {
    throw new Error('approval queue updater is required')
  }
  return withApprovalQueueLock(queueFilePath, async () => {
    const queue = await readJsonIfPresent(queueFilePath, [])
    if (!Array.isArray(queue)) {
      throw new Error('approval queue must be an array')
    }
    const result = await updater(queue)
    await writePrivateJson(queueFilePath, queue)
    return result
  })
}

async function updateApprovalRequest({ id, status, queueFilePath = defaultApprovalQueueFilePath(), reason = '', extra = {} }) {
  if (!id) {
    throw new Error('approval id is required')
  }
  return updateApprovalQueue({
    queueFilePath,
    updater(queue) {
      const item = queue.find((request) => request.id === id)
      if (!item) {
        throw new Error(`Approval request not found: ${id}`)
      }
      Object.assign(item, {
        status,
        reviewedAt: new Date().toISOString(),
        reviewReason: reason,
        ...extra
      })
      return item
    }
  })
}

export function approveAutoReply(options) {
  return updateApprovalRequest({ ...options, status: 'approved_auto_reply' })
}

export function requireHumanIntervention(options) {
  return updateApprovalRequest({ ...options, status: 'human_required' })
}

export function markAutoReplySent(options) {
  return updateApprovalRequest({
    ...options,
    status: 'auto_reply_sent',
    extra: { sentAt: new Date().toISOString() }
  })
}

export function markAutoReplyFailed(options) {
  return updateApprovalRequest({ ...options, status: 'auto_reply_failed' })
}

export function markAutoReplyExpired(options) {
  return updateApprovalRequest({ ...options, status: 'auto_reply_expired' })
}
