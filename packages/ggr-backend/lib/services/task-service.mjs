import { spawn as nodeSpawn } from 'node:child_process'

const RECENT_LINE_LIMIT = 80
const DEFAULT_DIAGNOSTIC_LINE_BYTES = 4096
const DEFAULT_DIAGNOSTIC_STREAM_BYTES = 64 * 1024
const SENSITIVE_KEYS = 'apiKey|accessKey|token|password|secret|credential|webhook'
const QUOTED_SENSITIVE_ASSIGNMENT = new RegExp(`((?:["']?)(?:${SENSITIVE_KEYS})(?:["']?)\\s*[=:]\\s*)(["'])(.*?)\\2`, 'gi')
const UNQUOTED_SENSITIVE_ASSIGNMENT = new RegExp(`((?:["']?)(?:${SENSITIVE_KEYS})(?:["']?)\\s*[=:]\\s*)(?!["'])([^\\s,}]+)`, 'gi')

function redactLine(value) {
  return String(value)
    .replace(QUOTED_SENSITIVE_ASSIGNMENT, (_match, prefix, quote) => `${prefix}${quote}[redacted]${quote}`)
    .replace(UNQUOTED_SENSITIVE_ASSIGNMENT, (_match, prefix) => `${prefix}[redacted]`)
}

function snapshot(record) {
  return {
    workerId: record.workerId,
    status: record.status,
    pid: record.child.pid,
    startedAt: record.startedAt,
    restartCount: record.restartCount,
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

function pushLine(record, stream, rawLine, wasTruncated, lineBytes, streamBytes, onLine) {
  if (!rawLine) return
  const sanitized = utf8Prefix(redactLine(rawLine), Math.min(lineBytes, streamBytes))
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

function pushDiagnostic(record, stream, chunk, lineBytes, streamBytes, onLine) {
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
    pushLine(record, stream, state.text, state.truncated, lineBytes, streamBytes, onLine)
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
  diagnosticStreamBytes = DEFAULT_DIAGNOSTIC_STREAM_BYTES
}) {
  if (!workerEntries || typeof workerEntries !== 'object') throw new TypeError('workerEntries are required')
  if (!Number.isInteger(diagnosticLineBytes) || diagnosticLineBytes <= 0) throw new TypeError('diagnosticLineBytes must be a positive integer')
  if (!Number.isInteger(diagnosticStreamBytes) || diagnosticStreamBytes <= 0) throw new TypeError('diagnosticStreamBytes must be a positive integer')
  const workers = new Map()
  const stoppedWorkers = new Set()
  const terminalChildren = new WeakSet()
  const stopPromises = new Map()

  function assertWorker(workerId) {
    if (typeof workerId !== 'string' || !Object.hasOwn(workerEntries, workerId)) {
      throw Object.assign(new Error(`Unsupported worker id: ${workerId}`), { code: 'INVALID_PARAMS' })
    }
    return workerEntries[workerId]
  }

  function assertStartOptions(options) {
    if (options === undefined) return
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw Object.assign(new Error('Task start options must be an object'), { code: 'INVALID_PARAMS' })
    }
    const unsupported = Object.keys(options)[0]
    if (unsupported) {
      throw Object.assign(new Error(`Unsupported task start option: ${unsupported}`), { code: 'INVALID_PARAMS' })
    }
  }

  function launch(workerId, restartCount = 0) {
    const entry = assertWorker(workerId)
    const child = spawnProcess(process.execPath, [entry], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const record = {
      workerId,
      child,
      status: 'running',
      startedAt: new Date().toISOString(),
      restartCount,
      recentStdout: [],
      recentStderr: [],
      stdoutCarry: { text: '', bytes: 0, truncated: false },
      stderrCarry: { text: '', bytes: 0, truncated: false },
      stdoutDiagnosticBytes: 0,
      stderrDiagnosticBytes: 0
    }
    workers.set(workerId, record)

    const progress = (stream, line, truncated) => emit('task.progress', { workerId, stream, line, truncated })
    child.stdout?.on?.('data', (chunk) => pushDiagnostic(record, 'stdout', chunk, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stdout', line, truncated)))
    child.stderr?.on?.('data', (chunk) => pushDiagnostic(record, 'stderr', chunk, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stderr', line, truncated)))

    const finalize = (code = null, signal = null, error = null) => {
      if (terminalChildren.has(child)) return
      terminalChildren.add(child)
      pushLine(record, 'stdout', record.stdoutCarry.text, record.stdoutCarry.truncated, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stdout', line, truncated))
      pushLine(record, 'stderr', record.stderrCarry.text, record.stderrCarry.truncated, diagnosticLineBytes, diagnosticStreamBytes, (line, truncated) => progress('stderr', line, truncated))
      resetCarry(record.stdoutCarry)
      resetCarry(record.stderrCarry)
      if (workers.get(workerId) === record) workers.delete(workerId)
      const restarting = !stoppedWorkers.has(workerId) && code !== 0
      emit('task.exited', {
        workerId,
        code,
        signal,
        restarting,
        restartCount: restartCount + (restarting ? 1 : 0),
        ...(error ? { error: redactLine(error.message) } : {})
      })
      if (restarting) {
        queueMicrotask(() => {
          if (!stoppedWorkers.has(workerId) && !workers.has(workerId)) launch(workerId, restartCount + 1)
        })
      }
    }
    child.once?.('error', (error) => finalize(null, null, error))
    child.once?.('exit', (code, signal) => finalize(code, signal))
    child.once?.('close', (code, signal) => finalize(code, signal))
    return snapshot(record)
  }

  async function start({ workerId, options } = {}) {
    assertWorker(workerId)
    assertStartOptions(options)
    const stopping = stopPromises.get(workerId)
    if (stopping) await stopping
    const running = workers.get(workerId)
    if (running) return snapshot(running)
    stoppedWorkers.delete(workerId)
    return launch(workerId)
  }

  async function stop({ workerId } = {}) {
    assertWorker(workerId)
    stoppedWorkers.add(workerId)
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

  return {
    list: () => [...workers.values()].map(snapshot),
    start,
    stop,
    stopAll
  }
}
