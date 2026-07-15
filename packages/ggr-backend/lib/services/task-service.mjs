import { spawn as nodeSpawn } from 'node:child_process'

const RECENT_LINE_LIMIT = 80
const DEFAULT_DIAGNOSTIC_LINE_BYTES = 4096
const DEFAULT_DIAGNOSTIC_STREAM_BYTES = 64 * 1024
const SENSITIVE_KEYS = 'apiKey|accessKey|token|password|secret|credential|webhook'
const ALLOWED_WORKER_EVENTS = new Set(['task.progress', 'approval.required'])
const SENSITIVE_ASSIGNMENT = new RegExp(`(?:["']?)(?:${SENSITIVE_KEYS})(?:["']?)\\s*[=:]\\s*`, 'gi')
const SENSITIVE_KEY = new RegExp(SENSITIVE_KEYS, 'i')

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function redactLine(value) {
  const input = String(value)
  SENSITIVE_ASSIGNMENT.lastIndex = 0
  const match = SENSITIVE_ASSIGNMENT.exec(input)
  return match ? `${input.slice(0, SENSITIVE_ASSIGNMENT.lastIndex)}[redacted]` : input
}

function redactPayload(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[redacted]'
  if (typeof value === 'string') return redactLine(value)
  if (Array.isArray(value)) return value.map((item) => redactPayload(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactPayload(item, name)]))
  return value
}

function redactDiagnostic(rawLine, wasTruncated) {
  if (!wasTruncated) {
    try { return JSON.stringify(redactPayload(JSON.parse(rawLine))) } catch {}
  }
  return redactLine(rawLine)
}

function snapshot(record) {
  return {
    workerId: record.workerId,
    status: record.status,
    pid: record.child.pid,
    startedAt: record.startedAt,
    restartCount: record.restartCount,
    runRecordId: record.runRecordId,
    runtimeStorage: {
      runRecordId: record.runRecordId,
      stepStatusMapByStepId: structuredClone(record.runtimeStorage.stepStatusMapByStepId)
    },
    recentStdout: [...record.recentStdout],
    recentStderr: [...record.recentStderr]
  }
}

function utf8Prefix(value, maxBytes) {
  let text = ''
  let bytes = 0
  for (const character of String(value)) {
    const characterBytes = Buffer.byteLength(character)
    if (bytes + characterBytes > maxBytes) return { text, bytes, truncated: true }
    text += character
    bytes += characterBytes
  }
  return { text, bytes, truncated: false }
}

function pushLine(record, stream, rawLine, wasTruncated, lineBytes, streamBytes, onLine, onStructured = () => false) {
  if (!rawLine) return
  if (!wasTruncated && onStructured(rawLine) === true) return
  const sanitized = utf8Prefix(redactDiagnostic(rawLine, wasTruncated), Math.min(lineBytes, streamBytes))
  const line = sanitized.text
  const bytesKey = `${stream}DiagnosticBytes`
  const target = record[stream === 'stdout' ? 'recentStdout' : 'recentStderr']
  while (target.length && record[bytesKey] + sanitized.bytes > streamBytes) {
    record[bytesKey] -= Buffer.byteLength(target.shift())
  }
  target.push(line)
  record[bytesKey] += sanitized.bytes
  while (target.length > RECENT_LINE_LIMIT) record[bytesKey] -= Buffer.byteLength(target.shift())
  onLine(line, wasTruncated || sanitized.truncated)
}

function structuredWorkerEvent(line, report) {
  let envelope
  try { envelope = JSON.parse(line) } catch { return false }
  if (!envelope || envelope.ggrWorkerEvent !== 1 || !ALLOWED_WORKER_EVENTS.has(envelope.event) ||
      !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return false
  const data = redactPayload(envelope.data)
  report(envelope.event, data)
  return true
}

function appendCarry(state, value, lineBytes) {
  if (state.truncated) return
  const prefix = utf8Prefix(value, lineBytes - state.bytes)
  state.text += prefix.text
  state.bytes += prefix.bytes
  state.truncated = prefix.truncated
}

function resetCarry(state) {
  state.text = ''
  state.bytes = 0
  state.truncated = false
}

function pushDiagnostic(record, stream, chunk, lineBytes, streamBytes, onLine, onStructured) {
  const state = record[`${stream}Carry`]
  const content = String(chunk)
  let start = 0
  let newline
  while ((newline = content.indexOf('\n', start)) !== -1) {
    appendCarry(state, content.slice(start, newline), lineBytes)
    if (state.text.endsWith('\r')) {
      state.text = state.text.slice(0, -1)
      state.bytes--
    }
    pushLine(record, stream, state.text, state.truncated, lineBytes, streamBytes, onLine, onStructured)
    resetCarry(state)
    start = newline + 1
  }
  appendCarry(state, content.slice(start), lineBytes)
}

export function createTaskService({
  spawnProcess = nodeSpawn,
  workerEntries,
  emit = () => {},
  stopTimeoutMs = 5000,
  diagnosticLineBytes = DEFAULT_DIAGNOSTIC_LINE_BYTES,
  diagnosticStreamBytes = DEFAULT_DIAGNOSTIC_STREAM_BYTES,
  restartPolicy = {},
  now = () => Date.now(),
  scheduleRestart = setTimeout,
  clearScheduledRestart = clearTimeout
}) {
  if (!workerEntries || typeof workerEntries !== 'object') throw new TypeError('workerEntries are required')
  if (!Number.isInteger(diagnosticLineBytes) || diagnosticLineBytes <= 0) throw new TypeError('diagnosticLineBytes must be a positive integer')
  if (!Number.isInteger(diagnosticStreamBytes) || diagnosticStreamBytes <= 0) throw new TypeError('diagnosticStreamBytes must be a positive integer')
  const workers = new Map()
  const stoppedWorkers = new Set()
  const terminalChildren = new WeakSet()
  const stopPromises = new Map()
  const restartStates = new Map()
  let updateDrain = false
  let nextRunRecordId = Date.now()
  const maxRestarts = positiveInteger(restartPolicy.maxRestarts, 3)
  const restartWindowMs = positiveInteger(restartPolicy.windowMs, 60_000)
  const initialRestartDelayMs = positiveInteger(restartPolicy.initialDelayMs, 5_000)
  const maxRestartDelayMs = positiveInteger(restartPolicy.maxDelayMs, 60_000)

  function resetRestartState(workerId) {
    const current = restartStates.get(workerId)
    if (current?.timer) clearScheduledRestart(current.timer)
    const state = { timestamps: [], timer: null }
    restartStates.set(workerId, state)
    return state
  }

  function assertWorker(workerId) {
    if (typeof workerId !== 'string' || !Object.hasOwn(workerEntries, workerId)) {
      throw Object.assign(new Error(`Unsupported worker id: ${workerId}`), { code: 'INVALID_PARAMS' })
    }
    return workerEntries[workerId]
  }

  function assertStartOptions(options) {
    if (options === undefined) return { headless: false }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw Object.assign(new Error('Task start options must be an object'), { code: 'INVALID_PARAMS' })
    }
    const unsupported = Object.keys(options).find((key) => key !== 'headless')
    if (unsupported) {
      throw Object.assign(new Error(`Unsupported task start option: ${unsupported}`), { code: 'INVALID_PARAMS' })
    }
    if (options.headless !== undefined && typeof options.headless !== 'boolean') {
      throw Object.assign(new Error('Task start option headless must be a boolean'), { code: 'INVALID_PARAMS' })
    }
    return { headless: Boolean(options.headless) }
  }

  function assertNotDraining() {
    if (updateDrain) throw Object.assign(new Error('Backend is draining active tasks for an update'), { code: 'UPDATE_DRAINING' })
  }

  function launch(workerId, restartCount = 0, options = { headless: false }, runRecordId = nextRunRecordId++, restartState = restartStates.get(workerId) ?? resetRestartState(workerId)) {
    const entry = assertWorker(workerId)
    const child = spawnProcess(process.execPath, [entry], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GGR_HEADLESS: String(options.headless) }
    })
    const record = {
      workerId,
      child,
      status: 'running',
      startedAt: new Date().toISOString(),
      restartCount,
      runRecordId,
      runtimeStorage: {
        stepStatusMapByStepId: {
          'worker-launch': { runRecordId, step: { id: 'worker-launch', status: 'fulfilled' } }
        }
      },
      recentStdout: [],
      recentStderr: [],
      stdoutCarry: { text: '', bytes: 0, truncated: false },
      stderrCarry: { text: '', bytes: 0, truncated: false },
      stdoutDiagnosticBytes: 0,
      stderrDiagnosticBytes: 0
    }
    workers.set(workerId, record)

    const progress = (stream, line, truncated) => { emit('task.progress', { workerId, runRecordId, stream, line, truncated }); return false }
    const report = (event, data) => {
      if (event === 'task.progress' && data.type === 'prerequisite-step-by-step-check' && data.step?.id) {
        record.runtimeStorage.stepStatusMapByStepId[data.step.id] = { runRecordId, step: data.step }
      }
      emit(event, { ...data, workerId, runRecordId })
    }
    child.stdout?.on?.('data', (chunk) => pushDiagnostic(record, 'stdout', chunk, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stdout', line, truncated), (line) => structuredWorkerEvent(line, report)))
    child.stderr?.on?.('data', (chunk) => pushDiagnostic(record, 'stderr', chunk, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stderr', line, truncated)))

    const finalize = (code = null, signal = null, error = null) => {
      if (terminalChildren.has(child)) return
      terminalChildren.add(child)
      pushLine(record, 'stdout', record.stdoutCarry.text, record.stdoutCarry.truncated, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stdout', line, truncated), (line) => structuredWorkerEvent(line, report))
      pushLine(record, 'stderr', record.stderrCarry.text, record.stderrCarry.truncated, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stderr', line, truncated))
      resetCarry(record.stdoutCarry)
      resetCarry(record.stderrCarry)
      if (workers.get(workerId) === record) workers.delete(workerId)
      const restartEligible = !stoppedWorkers.has(workerId) && code !== 0
      let restarting = false
      let restartSuppressed = false
      let restartDelayMs
      if (restartEligible) {
        const timestamp = now()
        restartState.timestamps = restartState.timestamps.filter((item) => timestamp - item <= restartWindowMs)
        restartState.timestamps.push(timestamp)
        if (restartState.timestamps.length > maxRestarts) {
          restartSuppressed = true
          stoppedWorkers.add(workerId)
        } else {
          restarting = true
          restartDelayMs = Math.min(initialRestartDelayMs * (2 ** (restartState.timestamps.length - 1)), maxRestartDelayMs)
        }
      }
      emit('task.exited', {
        workerId,
        runRecordId,
        code,
        signal,
        restarting,
        restartCount: restartCount + (restarting ? 1 : 0),
        ...(restartDelayMs ? { restartDelayMs } : {}),
        ...(restartSuppressed ? { restartSuppressed: true } : {}),
        ...(error ? { error: redactLine(error.message) } : {})
      })
      if (restarting) {
        restartState.timer = scheduleRestart(() => {
          restartState.timer = null
          if (!stoppedWorkers.has(workerId) && !workers.has(workerId) && restartStates.get(workerId) === restartState) {
            launch(workerId, restartCount + 1, options, runRecordId, restartState)
          }
        }, restartDelayMs)
      }
    }
    child.once?.('error', (error) => finalize(null, null, error))
    child.once?.('exit', (code, signal) => finalize(code, signal))
    child.once?.('close', (code, signal) => finalize(code, signal))
    return snapshot(record)
  }

  async function start({ workerId, options } = {}) {
    assertWorker(workerId)
    assertNotDraining()
    const startOptions = assertStartOptions(options)
    const stopping = stopPromises.get(workerId)
    if (stopping) await stopping
    assertNotDraining()
    const running = workers.get(workerId)
    if (running) return snapshot(running)
    stoppedWorkers.delete(workerId)
    return launch(workerId, 0, startOptions, nextRunRecordId++, resetRestartState(workerId))
  }

  async function stop({ workerId } = {}) {
    assertWorker(workerId)
    stoppedWorkers.add(workerId)
    const restartState = restartStates.get(workerId)
    if (restartState?.timer) {
      clearScheduledRestart(restartState.timer)
      restartState.timer = null
    }
    if (stopPromises.has(workerId)) return stopPromises.get(workerId)
    const record = workers.get(workerId)
    if (!record) return null

    const pending = (async () => {
      const child = record.child
      record.status = 'stopping'
      const exited = new Promise((resolve) => {
        if (terminalChildren.has(child)) resolve()
        else {
          child.once?.('exit', resolve)
          child.once?.('error', resolve)
        }
      })
      child.kill('SIGTERM')
      let timer
      const stopped = await Promise.race([
        exited.then(() => true),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), stopTimeoutMs) })
      ]).finally(() => clearTimeout(timer))
      if (!stopped && !terminalChildren.has(child)) {
        child.kill('SIGKILL')
        await exited
      }
      return null
    })()
    stopPromises.set(workerId, pending)
    try {
      return await pending
    } finally {
      if (stopPromises.get(workerId) === pending) stopPromises.delete(workerId)
    }
  }

  async function stopAll() {
    await Promise.all(Object.keys(workerEntries).map((workerId) => stop({ workerId })))
  }

  function setUpdateDrain({ enabled } = {}) {
    if (typeof enabled !== 'boolean') throw Object.assign(new Error('enabled must be a boolean'), { code: 'INVALID_PARAMS' })
    updateDrain = enabled
    return { enabled: updateDrain, activeTasks: [...workers.values()].map(snapshot) }
  }

  return {
    list: () => [...workers.values()].map(snapshot),
    start,
    stop,
    stopAll,
    setUpdateDrain
  }
}
