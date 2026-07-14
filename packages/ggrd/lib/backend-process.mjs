import path from 'node:path'
import { spawn as nodeSpawn } from 'node:child_process'

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Owns exactly one backend child.  This module deliberately knows only the
 * version artifact layout and RPC health callback; it never imports backend
 * implementation code.
 */
export function createBackendProcessManager({
  versionStore,
  spawnProcess = nodeSpawn,
  healthCheck = async () => true,
  diagnostic = () => {},
  now = () => Date.now(),
  crashPolicy = {},
  stopTimeoutMs = 5_000,
  killTimeoutMs = 5_000,
  runtimeDir = versionStore?.runtimeDir,
  backendSocketPath = path.join(runtimeDir ?? '', 'run', 'backend.sock'),
  supervisorPath = path.join(runtimeDir ?? '', 'run', 'supervisor.sock'),
  executablePath = '/usr/bin:/bin'
} = {}) {
  if (!versionStore?.current || !versionStore?.previous || !versionStore?.activate || !versionStore?.rollback || !versionStore?.versionsDir) {
    throw new TypeError('A version store with version pointers is required')
  }
  if (typeof spawnProcess !== 'function' || typeof healthCheck !== 'function') throw new TypeError('spawnProcess and healthCheck are required')

  const maxCrashes = positiveInteger(crashPolicy.maxCrashes, 3)
  const windowMs = positiveInteger(crashPolicy.windowMs, 60_000)
  const gracefulStopTimeoutMs = positiveInteger(stopTimeoutMs, 5_000)
  const forcedStopTimeoutMs = positiveInteger(killTimeoutMs, 5_000)
  const crashTimes = new Map()
  const failedVersions = new Set()
  let active = null
  let rollingBack = false
  let state = 'stopped'
  let lastFailure = null
  let lastRollback = null
  let stopPending = null

  const selectedEnv = (version) => Object.freeze({
    GGR_RUNTIME_DIR: runtimeDir,
    GGR_BACKEND_SOCKET: backendSocketPath,
    GGR_SUPERVISOR_SOCKET: supervisorPath,
    GGR_BACKEND_VERSION: version,
    PATH: executablePath
  })

  function report(event, fields = {}) {
    try { Promise.resolve(diagnostic({ event, ...fields })).catch(() => {}) } catch {}
  }

  function executableFor(version) {
    return {
      command: path.join(versionStore.versionsDir, version, 'bin', 'node'),
      args: [path.join(versionStore.versionsDir, version, 'app', 'server.mjs')]
    }
  }

  function launch(version) {
    if (failedVersions.has(version)) throw failure('VERSION_BLOCKED', `Automatic launch is blocked for crash-loop version ${version}`)
    const { command, args } = executableFor(version)
    let child
    try {
      child = spawnProcess(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: selectedEnv(version) })
    } catch (error) {
      throw failure('SPAWN_FAILED', error.message)
    }
    if (!child || typeof child.once !== 'function') throw failure('SPAWN_FAILED', 'Process launcher returned an invalid child')
    let resolveExit
    const record = {
      child, version, intentional: false, terminal: false,
      exited: new Promise((resolve) => { resolveExit = resolve }),
      resolveExit
    }
    active = record
    state = 'running'
    const exited = (code = null, signal = null, error = null) => {
      if (record.terminal) return
      record.terminal = true
      if (active === record) active = null
      record.resolveExit()
      if (record.intentional) return
      void onCrash(record, { code, signal, error })
    }
    child.once('exit', (code, signal) => exited(code, signal))
    child.once('error', (error) => exited(null, null, error))
    return record
  }

  async function onCrash(record, details) {
    const timestamp = now()
    const times = (crashTimes.get(record.version) ?? []).filter((time) => timestamp - time <= windowMs)
    times.push(timestamp)
    crashTimes.set(record.version, times)
    lastFailure = { code: 'BACKEND_CRASHED', version: record.version, ...details }
    if (times.length >= maxCrashes) {
      if (rollingBack || failedVersions.has(record.version)) return
      rollingBack = true
      failedVersions.add(record.version)
      try {
        if (await versionStore.current() !== record.version) return
        const previous = await versionStore.previous()
        if (!previous || failedVersions.has(previous)) {
          state = 'quarantined'
          lastFailure = { code: 'CRASH_LOOP_QUARANTINED', version: record.version, previous: previous ?? null }
          report('backend.crash_loop_quarantined', lastFailure)
          return
        }
        const restored = await versionStore.rollback()
        lastRollback = { automatic: true, failedVersion: record.version, restoredVersion: restored }
        report('backend.crash_loop_rollback', { failedVersion: record.version, restoredVersion: restored })
        await start(restored)
      } catch (error) {
        lastFailure = { code: error.code ?? 'ROLLBACK_FAILED', version: record.version, message: error.message }
        report('backend.crash_loop_rollback_failed', lastFailure)
      } finally {
        rollingBack = false
      }
      return
    }
    if (failedVersions.has(record.version) || rollingBack) return
    queueMicrotask(async () => {
      if (active || failedVersions.has(record.version) || rollingBack) return
      try {
        if (await versionStore.current() === record.version) await start(record.version)
      } catch (error) {
        lastFailure = { code: error.code ?? 'RESTART_FAILED', version: record.version, message: error.message }
        report('backend.restart_failed', lastFailure)
      }
    })
  }

  async function start(version) {
    if (version === undefined) version = await versionStore.current()
    if (!version) throw failure('NO_CURRENT_VERSION', 'No backend version is active')
    if (active && !active.terminal) return { version: active.version, pid: active.child.pid }
    const record = launch(version)
    return { version, pid: record.child.pid }
  }

  async function stop() {
    if (stopPending) return stopPending
    const record = active
    if (!record || record.terminal) { state = 'stopped'; return }
    stopPending = (async () => {
      record.intentional = true
      state = 'stopping'
      const waitForExit = async (timeoutMs) => {
        let timer
        return Promise.race([
          record.exited.then(() => true),
          new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) })
        ]).finally(() => clearTimeout(timer))
      }
      try { record.child.kill?.('SIGTERM') } catch {}
      if (!await waitForExit(gracefulStopTimeoutMs)) {
        try { record.child.kill?.('SIGKILL') } catch {}
        if (!await waitForExit(forcedStopTimeoutMs)) {
          state = 'quarantined'
          throw failure('STOP_TIMEOUT', 'Backend process did not exit after SIGTERM and SIGKILL')
        }
      }
      state = 'stopped'
    })()
    try {
      return await stopPending
    } finally {
      if (stopPending) stopPending = null
    }
  }

  async function activateCandidate(version, { deadlineMs, correlationId } = {}) {
    if (typeof version !== 'string' || !version) throw failure('INVALID_PARAMS', 'Candidate version is required')
    const current = await versionStore.current()
    if (!current) throw failure('NO_CURRENT_VERSION', 'No previous backend version is available')
    const prior = active
    if (prior) await stop()
    state = 'activating'
    let activated = false
    try {
      await versionStore.activate(version)
      activated = true
      const candidate = launch(version)
      const timeoutMs = positiveInteger(deadlineMs, 30_000)
      let timer
      const ready = await Promise.race([
        healthCheck({ version, child: candidate.child, deadlineMs: timeoutMs }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failure('HEALTH_CHECK_TIMEOUT', 'Candidate system.health deadline elapsed')), timeoutMs) })
      ]).finally(() => clearTimeout(timer))
      if (!ready || ready.ready === false) throw failure('HEALTH_CHECK_FAILED', 'Candidate did not pass system.health')
      state = 'running'
      return { version, pid: candidate.child.pid, health: ready === true ? { ready: true } : ready }
    } catch (error) {
      if (active?.version === version) await stop()
      try {
        const restored = activated ? await versionStore.rollback() : current
        await start(restored)
        report('backend.candidate_rollback', { correlationId, candidate: version, restored, reason: error.code ?? 'ACTIVATION_FAILED' })
      } catch (rollbackError) {
        lastFailure = { code: rollbackError.code ?? 'ROLLBACK_FAILED', message: rollbackError.message, candidate: version }
        report('backend.candidate_rollback_failed', { correlationId, ...lastFailure })
      }
      const failed = error?.code ? error : failure('ACTIVATION_FAILED', error?.message ?? 'Candidate activation failed')
      lastFailure = { code: failed.code, message: failed.message, candidate: version }
      state = 'running'
      throw failed
    }
  }

  return Object.freeze({
    start,
    stop,
    activateCandidate,
    status() {
      return {
        state,
        activeVersion: active?.version ?? null,
        pid: active?.child?.pid ?? null,
        failedVersions: [...failedVersions],
        lastFailure,
        rollback: lastRollback
      }
    }
  })
}
