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
const ARRAY_CONFIG_FILES = new Set(['target-company-list.json', 'llm.json'])
const RECENT_LINE_LIMIT = 80
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultRepoRoot() {
  return path.resolve(__dirname, '../..')
}

function defaultApprovalQueueFilePath() {
  return path.join(os.homedir(), '.geekgeekrun', 'storage', 'hr-reply-approval-queue.json')
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
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
  await fs.chmod(filePath, PRIVATE_FILE_MODE).catch(() => {})
}

export async function updateRuntimeConfig({ fileName, patch }) {
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

  const configDir = path.join(os.homedir(), '.geekgeekrun/config')
  const filePath = path.join(configDir, fileName)
  await fs.mkdir(configDir, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(configDir, PRIVATE_DIR_MODE).catch(() => {})

  const nextConfig = ARRAY_CONFIG_FILES.has(fileName)
    ? patch
    : { ...(await readJsonIfPresent(filePath, {})), ...patch }

  await writePrivateJson(filePath, nextConfig)
  return { fileName, written: true }
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
  const queue = await readJsonIfPresent(queueFilePath, [])
  if (!Array.isArray(queue)) {
    return []
  }
  return includeAll ? queue : queue.filter((item) => item.status === 'pending')
}

async function updateApprovalRequest({ id, status, queueFilePath = defaultApprovalQueueFilePath(), reason = '' }) {
  if (!id) {
    throw new Error('approval id is required')
  }
  const queue = await readJsonIfPresent(queueFilePath, [])
  if (!Array.isArray(queue)) {
    throw new Error('approval queue must be an array')
  }
  const item = queue.find((request) => request.id === id)
  if (!item) {
    throw new Error(`Approval request not found: ${id}`)
  }
  Object.assign(item, {
    status,
    reviewedAt: new Date().toISOString(),
    reviewReason: reason
  })
  await writePrivateJson(queueFilePath, queue)
  return item
}

export function approveReply(options) {
  return updateApprovalRequest({ ...options, status: 'approved' })
}

export function rejectReply(options) {
  return updateApprovalRequest({ ...options, status: 'rejected' })
}
