import { spawn as nodeSpawn } from 'node:child_process'

const RECENT_LINE_LIMIT = 80
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

function pushLine(target, rawLine, onLine) {
  if (!rawLine) return
  const line = redactLine(rawLine)
  target.push(line)
  if (target.length > RECENT_LINE_LIMIT) target.splice(0, target.length - RECENT_LINE_LIMIT)
  onLine(line)
}

function pushDiagnostic(record, stream, chunk, onLine) {
  const bufferKey = `${stream}Buffer`
  const target = record[stream === 'stdout' ? 'recentStdout' : 'recentStderr']
  const content = record[bufferKey] + String(chunk)
  const lines = content.split('\n')
  record[bufferKey] = lines.pop()
  for (const rawLine of lines) {
    const normalized = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    pushLine(target, normalized, onLine)
  }
}

export function createTaskService({
  spawnProcess = nodeSpawn,
  workerEntries,
  emit = () => {},
  stopTimeoutMs = 5000
}) {
  if (!workerEntries || typeof workerEntries !== 'object') throw new TypeError('workerEntries are required')
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
      stdoutBuffer: '',
      stderrBuffer: ''
    }
    workers.set(workerId, record)

    const progress = (stream, line) => emit('task.progress', { workerId, stream, line })
    child.stdout?.on?.('data', (chunk) => pushDiagnostic(record, 'stdout', chunk, (line) => progress('stdout', line)))
    child.stderr?.on?.('data', (chunk) => pushDiagnostic(record, 'stderr', chunk, (line) => progress('stderr', line)))

    const finalize = (code = null, signal = null, error = null) => {
      if (terminalChildren.has(child)) return
      terminalChildren.add(child)
      pushLine(record.recentStdout, record.stdoutBuffer, (line) => progress('stdout', line))
      pushLine(record.recentStderr, record.stderrBuffer, (line) => progress('stderr', line))
      record.stdoutBuffer = ''
      record.stderrBuffer = ''
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
