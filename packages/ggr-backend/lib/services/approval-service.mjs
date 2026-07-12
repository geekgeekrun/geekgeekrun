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

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

async function readLockSnapshot(lockPath) {
  let handle
  try {
    handle = await fs.open(lockPath, 'r')
    const [stat, content] = await Promise.all([handle.stat(), handle.readFile('utf8')])
    const state = JSON.parse(content)
    return { state, dev: stat.dev, ino: stat.ino }
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null
    throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

function sameLock(left, right) {
  const leftToken = left?.state?.token ?? left?.token
  const rightToken = right?.state?.token ?? right?.token
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino && leftToken === rightToken)
}

async function writeHolderState(holder, leaseAt) {
  const state = { token: holder.token, pid: holder.pid, leaseAt }
  const payload = Buffer.from(JSON.stringify(state))
  let offset = 0
  while (offset < payload.length) {
    const { bytesWritten } = await holder.handle.write(payload, offset, payload.length - offset, offset)
    offset += bytesWritten
  }
  await holder.handle.truncate(payload.length)
  await holder.handle.sync()
  holder.leaseAt = leaseAt
}

async function tryCreateHolder(lockPath) {
  let handle
  let holder
  try {
    handle = await fs.open(lockPath, 'wx', PRIVATE_FILE_MODE)
    const stat = await handle.stat()
    holder = { handle, token: randomUUID(), pid: process.pid, dev: stat.dev, ino: stat.ino }
    await writeHolderState(holder, Date.now())
    return holder
  } catch (error) {
    if (error?.code === 'EEXIST') return null
    if (holder) {
      const pathStat = await fs.lstat(lockPath).catch(() => null)
      if (pathStat?.dev === holder.dev && pathStat?.ino === holder.ino) await fs.unlink(lockPath).catch(() => {})
    }
    await handle?.close().catch(() => {})
    throw error
  }
}

async function refreshHolder(lockPath, holder) {
  const current = await readLockSnapshot(lockPath)
  if (!sameLock(holder, current)) return false
  await writeHolderState(holder, Date.now())
  return true
}

async function removeIfOwned(lockPath, holder) {
  const current = await readLockSnapshot(lockPath)
  if (!sameLock(holder, current)) return false
  const pathStat = await fs.lstat(lockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (!pathStat || pathStat.dev !== holder.dev || pathStat.ino !== holder.ino) return false
  const final = await readLockSnapshot(lockPath)
  if (!sameLock(holder, final)) return false
  await fs.unlink(lockPath).catch((error) => { if (error?.code !== 'ENOENT') throw error })
  return true
}

async function breakExpiredLockWithoutCompetition(lockPath, { staleMs, isProcessAlive }) {
  const observed = await readLockSnapshot(lockPath)
  if (!observed || !Number.isFinite(observed.state?.leaseAt)) return false
  if (Date.now() - observed.state.leaseAt <= staleMs || await isProcessAlive(observed.state.pid)) return false

  const current = await readLockSnapshot(lockPath)
  if (!sameLock(observed, current)) return false
  if (Date.now() - current.state.leaseAt <= staleMs || await isProcessAlive(current.state.pid)) return false
  const final = await readLockSnapshot(lockPath)
  if (!sameLock(current, final)) return false
  if (Date.now() - final.state.leaseAt <= staleMs) return false
  const pathStat = await fs.lstat(lockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (!pathStat || pathStat.dev !== final.dev || pathStat.ino !== final.ino) return false
  await fs.unlink(lockPath).catch((error) => { if (error?.code !== 'ENOENT') throw error })
  return true
}

async function breakExpiredLock(lockPath, options) {
  const cleanerPath = `${lockPath}.clean`
  const cleaner = await tryCreateHolder(cleanerPath)
  if (!cleaner) return false
  try {
    return await breakExpiredLockWithoutCompetition(lockPath, options)
  } finally {
    await removeIfOwned(cleanerPath, cleaner)
    await cleaner.handle.close().catch(() => {})
  }
}

async function withQueueLock(queueFilePath, operation, {
  timeoutMs = LOCK_TIMEOUT_MS,
  staleMs = LOCK_STALE_MS,
  retryMs = LOCK_RETRY_MS,
  heartbeatMs = Math.max(1, Math.floor(staleMs / 3)),
  isProcessAlive = processIsAlive
} = {}) {
  const directory = path.dirname(queueFilePath)
  const lockPath = `${queueFilePath}.lock`
  const deadline = Date.now() + timeoutMs
  let holder

  await fs.mkdir(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(directory, PRIVATE_DIR_MODE)
  while (!holder) {
    holder = await tryCreateHolder(lockPath)
    if (holder) break
    if (await breakExpiredLock(lockPath, { staleMs, isProcessAlive })) continue
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for approval queue lock: ${queueFilePath}`)
    await sleep(retryMs)
  }

  let heartbeats = Promise.resolve()
  const heartbeat = setInterval(() => {
    heartbeats = heartbeats.then(() => refreshHolder(lockPath, holder)).catch(() => false)
  }, heartbeatMs)
  try {
    return await operation()
  } finally {
    clearInterval(heartbeat)
    await heartbeats
    await removeIfOwned(lockPath, holder)
    await holder.handle.close().catch(() => {})
  }
}

export function createApprovalService({
  queueFilePath = defaultApprovalQueueFilePath(),
  emit = () => {},
  clock = () => new Date(),
  lockTimeoutMs,
  lockStaleMs,
  lockRetryMs,
  lockHeartbeatMs,
  isProcessAlive
} = {}) {
  const lockOptions = {
    timeoutMs: lockTimeoutMs,
    staleMs: lockStaleMs,
    retryMs: lockRetryMs,
    heartbeatMs: lockHeartbeatMs,
    isProcessAlive
  }
  async function list({ includeAll = false } = {}) {
    return withQueueLock(queueFilePath, async () => {
      const queue = await readQueueFile(queueFilePath)
      if (!Array.isArray(queue)) return []
      return includeAll ? queue : queue.filter((item) => item.status === 'pending')
    }, lockOptions)
  }

  async function update(updater) {
    if (typeof updater !== 'function') throw new Error('approval queue updater is required')
    return withQueueLock(queueFilePath, async () => {
      const queue = await readQueueFile(queueFilePath)
      if (!Array.isArray(queue)) throw new Error('approval queue must be an array')
      const result = await updater(queue)
      await writePrivateJson(queueFilePath, queue)
      return result
    }, lockOptions)
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
