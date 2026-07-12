import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const LOCK_TIMEOUT_MS = 5000
const LOCK_STALE_MS = 30000
const LOCK_RETRY_MS = 25

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function defaultApprovalQueueFilePath() {
  return path.join(os.homedir(), '.geekgeekrun', 'storage', 'hr-reply-approval-queue.json')
}

async function backupCorruptFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await fs.rename(filePath, `${filePath}.corrupt-${timestamp}.bak`).catch(() => {})
}

async function readQueueFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    await fs.chmod(filePath, PRIVATE_FILE_MODE)
    return JSON.parse(content)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    if (error instanceof SyntaxError) {
      await backupCorruptFile(filePath)
      return []
    }
    throw error
  }
}

async function writePrivateJson(filePath, value) {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(directory, PRIVATE_DIR_MODE)
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
    await fs.chmod(temporaryPath, PRIVATE_FILE_MODE)
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

async function withQueueLock(queueFilePath, operation) {
  const directory = path.dirname(queueFilePath)
  const lockPath = `${queueFilePath}.lock`
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let lockHandle

  await fs.mkdir(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(directory, PRIVATE_DIR_MODE)
  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockPath, 'wx', PRIVATE_FILE_MODE)
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const lockInfo = await fs.stat(lockPath).catch(() => null)
      if (lockInfo && Date.now() - lockInfo.mtimeMs > LOCK_STALE_MS) {
        await fs.unlink(lockPath).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for approval queue lock: ${queueFilePath}`)
      await sleep(LOCK_RETRY_MS)
    }
  }

  try {
    return await operation()
  } finally {
    await lockHandle.close().catch(() => {})
    await fs.unlink(lockPath).catch(() => {})
  }
}

export function createApprovalService({
  queueFilePath = defaultApprovalQueueFilePath(),
  emit = () => {},
  clock = () => new Date()
} = {}) {
  async function list({ includeAll = false } = {}) {
    return withQueueLock(queueFilePath, async () => {
      const queue = await readQueueFile(queueFilePath)
      if (!Array.isArray(queue)) return []
      return includeAll ? queue : queue.filter((item) => item.status === 'pending')
    })
  }

  async function update(updater) {
    if (typeof updater !== 'function') throw new Error('approval queue updater is required')
    return withQueueLock(queueFilePath, async () => {
      const queue = await readQueueFile(queueFilePath)
      if (!Array.isArray(queue)) throw new Error('approval queue must be an array')
      const result = await updater(queue)
      await writePrivateJson(queueFilePath, queue)
      return result
    })
  }

  async function setStatus({ id, status, reason = '', extra = {} }) {
    if (!id) throw Object.assign(new Error('approval id is required'), { code: 'INVALID_PARAMS' })
    return update((queue) => {
      const item = queue.find((request) => request.id === id)
      if (!item) throw Object.assign(new Error(`Approval request not found: ${id}`), { code: 'INVALID_PARAMS' })
      Object.assign(item, {
        status,
        reviewedAt: clock().toISOString(),
        reviewReason: reason,
        ...extra
      })
      return { ...item }
    })
  }

  const approve = (params) => setStatus({ ...params, status: 'approved_auto_reply' })
  const requireHuman = async (params) => {
    const item = await setStatus({ ...params, status: 'human_required' })
    emit('approval.required', item)
    return item
  }

  return { list, update, setStatus, approve, requireHuman }
}

export function readApprovalQueue({ queueFilePath = defaultApprovalQueueFilePath(), includeAll = false } = {}) {
  return createApprovalService({ queueFilePath }).list({ includeAll })
}

export function updateApprovalQueue({ queueFilePath = defaultApprovalQueueFilePath(), updater } = {}) {
  return createApprovalService({ queueFilePath }).update(updater)
}

function updateApprovalRequest({ id, status, queueFilePath = defaultApprovalQueueFilePath(), reason = '', extra = {} }) {
  return createApprovalService({ queueFilePath }).setStatus({ id, status, reason, extra })
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
