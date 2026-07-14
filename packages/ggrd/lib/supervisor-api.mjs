import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PROTOCOL_VERSION, assertHandshake } from '@geekgeekrun/ggr-protocol'

const SENSITIVE_FIELD_PATTERN = /(apiKey|accessKey|key|token|password|secret|credential|webhook)/i
const REDACTED = '[redacted]'

function failure(code, message, data) {
  return Object.assign(new Error(message), { code, ...(data === undefined ? {} : { data }) })
}

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!plainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_FIELD_PATTERN.test(key) ? REDACTED : redactSecrets(entry)]))
}

/** A private, serialized JSONL diagnostic sink with one retained rotation. */
export async function createSupervisorDiagnostics({ filePath, clock = () => new Date(), maxBytes = 1024 * 1024 } = {}) {
  if (!path.isAbsolute(filePath)) throw new TypeError('Diagnostic filePath must be absolute')
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.chmod(path.dirname(filePath), 0o700)
  let handle = await fs.open(filePath, 'a', 0o600)
  await fs.chmod(filePath, 0o600)
  let size = (await handle.stat()).size
  let pending = Promise.resolve()
  let closed = false
  const serialize = (operation) => {
    const next = pending.catch(() => {}).then(operation)
    pending = next
    return next
  }
  async function rotate(incoming) {
    if (!size || size + incoming <= maxBytes) return
    await handle.sync(); await handle.close()
    await fs.rm(`${filePath}.1`, { force: true })
    await fs.rename(filePath, `${filePath}.1`)
    handle = await fs.open(filePath, 'a', 0o600)
    await fs.chmod(filePath, 0o600)
    size = 0
  }
  return Object.freeze({
    write: (level, event, fields = {}) => serialize(async () => {
      if (closed) throw new Error('Diagnostics are closed')
      const line = `${JSON.stringify(redactSecrets({ timestamp: clock().toISOString(), level, event, ...fields }))}\n`
      await rotate(Buffer.byteLength(line))
      await handle.write(line)
      size += Buffer.byteLength(line)
    }),
    tail: async ({ limit = 100 } = {}) => {
      const count = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 100
      const raw = await fs.readFile(filePath, 'utf8').catch((error) => error.code === 'ENOENT' ? '' : Promise.reject(error))
      return raw.split('\n').filter(Boolean).slice(-count).map((line) => {
        try { return JSON.parse(line) } catch { return { event: 'diagnostic.invalid_line' } }
      })
    },
    close: () => serialize(async () => {
      if (closed) return
      closed = true
      await handle.sync(); await handle.close()
    })
  })
}

function onlyKeys(params, allowed) {
  if (!plainObject(params)) throw failure('INVALID_PARAMS', 'RPC params must be an object')
  const unexpected = Object.keys(params).find((key) => !allowed.has(key))
  if (unexpected) throw failure('INVALID_PARAMS', `Unsupported parameter: ${unexpected}`)
}

export function createSupervisorApi({ versionStore, processManager, backendClient, installer, checkForUpdates = async () => null, diagnostics, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!versionStore?.current || !versionStore?.previous || !versionStore?.rollback || !processManager?.activateCandidate || !processManager?.status) {
    throw new TypeError('versionStore and processManager are required')
  }
  let installLock = Promise.resolve()
  let state = 'idle'
  let candidate = null
  let progress = null
  let lastFailure = null
  let rollback = { automatic: false, version: null }
  let drainActive = false

  const write = async (level, event, fields) => diagnostics?.write?.(level, event, fields).catch?.(() => {})
  const serializeInstall = (operation) => {
    const next = installLock.catch(() => {}).then(operation)
    installLock = next
    return next
  }
  async function activeTasks() {
    const tasks = await backendClient.request('task.list', {})
    return Array.isArray(tasks) ? tasks : []
  }
  async function drainTasks({ deadlineMs, cancelRunningTasks, correlationId }) {
    if (!backendClient?.request) throw failure('BACKEND_UNAVAILABLE', 'A backend RPC client is required for a safe update')
    const deadline = now() + deadlineMs
    let tasks = await activeTasks()
    if (!tasks.length) return []
    await backendClient.request('system.updateDrain', { enabled: true })
    drainActive = true
    await write('info', 'update.drain_requested', { correlationId, activeTasks: tasks })
    if (cancelRunningTasks) {
      await Promise.all(tasks.map(({ workerId }) => typeof workerId === 'string' ? backendClient.request('task.stop', { workerId }) : Promise.resolve()))
    }
    while (tasks.length && now() < deadline) {
      progress = 'waiting_safe_exit'
      await sleep(Math.min(100, Math.max(1, deadline - now())))
      tasks = await activeTasks()
    }
    if (tasks.length) throw failure('TASKS_ACTIVE', 'Tasks have not reached safe exit points before the update deadline', { tasks })
    return []
  }
  async function status() {
    const manager = processManager.status()
    return {
      current: await versionStore.current(),
      previous: await versionStore.previous(),
      candidate,
      progress,
      lastFailure: lastFailure ?? manager.lastFailure ?? null,
      rollback: manager.rollback ?? rollback,
      state: manager.state ?? state
    }
  }
  async function install(params, correlationId) {
    onlyKeys(params, new Set(['manifest', 'deadlineMs', 'cancelRunningTasks']))
    if (!plainObject(params.manifest) || typeof params.manifest.version !== 'string' || !params.manifest.version) throw failure('INVALID_PARAMS', 'A verified manifest with a version is required')
    if (!Number.isInteger(params.deadlineMs) || params.deadlineMs <= 0 || params.deadlineMs > 10 * 60_000) throw failure('INVALID_PARAMS', 'deadlineMs must be between 1 and 600000')
    if (params.cancelRunningTasks !== undefined && typeof params.cancelRunningTasks !== 'boolean') throw failure('INVALID_PARAMS', 'cancelRunningTasks must be a boolean')
    if (typeof installer !== 'function') throw failure('INSTALLER_UNAVAILABLE', 'No installer is configured')
    return serializeInstall(async () => {
      state = 'installing'; candidate = params.manifest.version; progress = 'staging'; lastFailure = null
      try {
        const installed = await installer({ manifest: params.manifest, correlationId })
        if (!installed || installed.version !== candidate) throw failure('INSTALL_FAILED', 'Installer did not return the requested candidate version')
        const current = await versionStore.current()
        if (current) {
          progress = 'draining'
          await drainTasks({ deadlineMs: params.deadlineMs, cancelRunningTasks: Boolean(params.cancelRunningTasks), correlationId })
        }
        progress = 'activating'
        const result = await processManager.activateCandidate(candidate, { deadlineMs: params.deadlineMs, correlationId })
        // A successful activation is a fresh backend process, which starts with
        // task admission enabled; do not send a post-activation control message
        // to a potentially stale socket.
        drainActive = false
        state = 'running'; progress = 'ready'
        await write('info', 'update.installed', { correlationId, candidate, result })
        return result
      } catch (error) {
        if (drainActive) {
          await backendClient.request('system.updateDrain', { enabled: false }).catch(() => {})
          drainActive = false
        }
        state = 'failed'; progress = 'failed'
        lastFailure = { code: error.code ?? 'INSTALL_FAILED', message: error.message, candidate }
        await write('error', 'update.failed', { correlationId, error: lastFailure })
        throw error
      }
    })
  }

  return Object.freeze({
    async dispatch(request) {
      if (!plainObject(request) || typeof request.method !== 'string' || typeof request.id !== 'string') throw failure('INVALID_PARAMS', 'A protocol request id and method are required')
      const params = request.params ?? {}
      const correlationId = request.id || randomUUID()
      switch (request.method) {
        case 'system.handshake':
          try { assertHandshake(params) } catch (error) { throw failure('INVALID_PARAMS', error.message) }
          if (params.protocolVersion !== PROTOCOL_VERSION) throw failure('PROTOCOL_INCOMPATIBLE', `Protocol version ${params.protocolVersion} is not supported`)
          return { protocolMin: PROTOCOL_VERSION, protocolMax: PROTOCOL_VERSION, service: 'ggrd' }
        case 'supervisor.status': onlyKeys(params, new Set()); return status()
        case 'update.check': onlyKeys(params, new Set()); return checkForUpdates()
        case 'update.install': return install(params, correlationId)
        case 'update.rollback':
          onlyKeys(params, new Set())
          state = 'rolling_back'; progress = 'rolling_back'
          await processManager.stop()
          rollback = { automatic: false, version: await versionStore.rollback(), reason: 'MANUAL_REQUEST' }
          await processManager.start?.(rollback.version)
          state = 'running'; progress = 'ready'
          await write('warn', 'update.rollback', { correlationId, rollback })
          return rollback
        case 'supervisor.repair':
          onlyKeys(params, new Set())
          await processManager.stop()
          await processManager.start?.()
          state = 'running'; progress = 'repaired'
          return status()
        case 'diagnostics.tail':
          onlyKeys(params, new Set(['limit']))
          return diagnostics?.tail?.({ limit: params.limit }) ?? []
        default: throw failure('METHOD_NOT_FOUND', `Unknown method: ${request.method}`)
      }
    }
  })
}
