import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CONFIG_FILES = new Set([
  'boss.json',
  'common-job-condition-config.json',
  'target-company-list.json',
  'llm.json',
  'dingtalk.json',
])
const ARRAY_CONFIG_FILES = new Set(['target-company-list.json', 'llm.json'])
const RECENT_LINE_LIMIT = 80
const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultRepoRoot () {
  return path.resolve(__dirname, '../../..')
}

function pushLines (target, chunk) {
  const lines = String(chunk).split(/\r?\n/).filter(Boolean)
  target.push(...lines)
  if (target.length > RECENT_LINE_LIMIT) {
    target.splice(0, target.length - RECENT_LINE_LIMIT)
  }
}

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readJsonIfPresent (filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

export function createAgentService ({ repoRoot = defaultRepoRoot() } = {}) {
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
    recentStderr: [],
  }

  function snapshot () {
    return {
      ...status,
      recentStdout: [...status.recentStdout],
      recentStderr: [...status.recentStderr],
    }
  }

  async function updateConfig ({ fileName, patch }) {
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

    await fs.writeFile(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
    await fs.chmod(filePath, PRIVATE_FILE_MODE).catch(() => {})
    return { fileName, written: true }
  }

  async function applyConfigPatch (configPatch) {
    if (!configPatch) {
      return []
    }

    if (Array.isArray(configPatch)) {
      return Promise.all(configPatch.map(updateConfig))
    }

    if ('fileName' in configPatch) {
      return [await updateConfig(configPatch)]
    }

    return Promise.all(Object.entries(configPatch).map(([fileName, patch]) => updateConfig({ fileName, patch })))
  }

  async function start ({ headless = true, mode = 'semi_auto', configPatch } = {}) {
    if (child) {
      return snapshot()
    }

    const configResults = await applyConfigPatch(configPatch)
    const daemonPath = path.join(repoRoot, 'packages/run-core-of-geek-auto-start-chat-with-boss/daemon-main.mjs')

    child = spawn(process.execPath, [daemonPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        GGR_HEADLESS: String(Boolean(headless)),
        GGR_AGENT_MODE: mode,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

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

    child.stdout.on('data', chunk => pushLines(status.recentStdout, chunk))
    child.stderr.on('data', chunk => pushLines(status.recentStderr, chunk))
    child.once('error', error => {
      status.lastError = error.message
    })
    child.once('exit', (exitCode, signal) => {
      status.running = false
      status.pid = null
      status.exitedAt = new Date().toISOString()
      status.exitCode = exitCode
      status.signal = signal
      child = null
      stopping = false
    })

    return snapshot()
  }

  async function stop () {
    if (!child) {
      return snapshot()
    }

    stopping = true
    const exitingChild = child
    const exited = new Promise(resolve => exitingChild.once('exit', resolve))
    exitingChild.kill('SIGTERM')

    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 5000)),
    ])
    if (!stopped && stopping && child === exitingChild) {
      exitingChild.kill('SIGKILL')
      await exited
    }

    return snapshot()
  }

  return {
    start,
    stop,
    getStatus: snapshot,
    updateConfig,
  }
}
