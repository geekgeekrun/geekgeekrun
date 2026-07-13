import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { defaultPromptMap } from '../workers/read-no-reply/llm.mjs'

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const SENSITIVE_FIELD_PATTERN = /(apiKey|accessKey|key|token|password|secret|credential|webhook)/i
const RESOURCES = Object.freeze({
  job_intention: { fileName: 'common-job-condition-config.json', writable: true },
  opening_message: { fileName: 'boss.json', writable: true },
  reply_policy: { fileName: 'boss.json', writable: true },
  target_companies: { fileName: 'target-company-list.json', writable: true, array: true },
  blacklist_companies: { fileName: 'boss.json', writable: true },
  llm_config: { fileName: 'llm.json', writable: true, array: true },
  resumes: { fileName: 'resumes.json', writable: true, array: true },
  notification_config: { fileName: 'dingtalk.json', writable: true },
  boss_cookies: { fileName: 'boss-cookies.json', writable: true, array: true, location: 'storage' },
  auto_reminder_open_template: { fileName: defaultPromptMap.open.fileName, writable: true, text: true, location: 'storage', fallback: defaultPromptMap.open.content },
  auto_reminder_rechat_template: { fileName: defaultPromptMap.rechat.fileName, writable: true, text: true, location: 'storage', fallback: defaultPromptMap.rechat.content },
  auto_reminder_open_template_default: { writable: false, defaultOnly: true, fallback: defaultPromptMap.open.content },
  auto_reminder_rechat_template_default: { writable: false, defaultOnly: true, fallback: defaultPromptMap.rechat.content },
  runtime_status: { type: 'runtime_status', writable: false }
})

const invalidParams = (message) => Object.assign(new Error(message), { code: 'INVALID_PARAMS' })
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_FIELD_PATTERN.test(key) ? '[redacted]' : redactSecrets(entry)
  ]))
}

function definitionFor(resource) {
  if (typeof resource !== 'string' || !Object.hasOwn(RESOURCES, resource)) throw invalidParams(`Unsupported config resource: ${resource}`)
  return RESOURCES[resource]
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) result[key] = isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key], value) : value
  return result
}

async function readJson(filePath, fallback, clock) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    if (error instanceof SyntaxError) {
      const timestamp = clock().toISOString().replace(/[:.]/g, '-')
      await fs.rename(filePath, `${filePath}.corrupt-${timestamp}.bak`)
      return fallback
    }
    throw error
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(path.dirname(filePath), PRIVATE_DIR_MODE)
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: PRIVATE_FILE_MODE })
    const handle = await fs.open(temporary, 'r')
    try { await handle.sync() } finally { await handle.close() }
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, PRIVATE_FILE_MODE)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

async function readText(filePath, fallback) {
  try { return await fs.readFile(filePath, 'utf8') } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(path.dirname(filePath), PRIVATE_DIR_MODE)
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, value, { mode: PRIVATE_FILE_MODE })
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, PRIVATE_FILE_MODE)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

export function createConfigService({ configDir, storageDir = configDir, clock = () => new Date() }) {
  const writes = new Map()
  function serialize(filePath, operation) {
    const pending = (writes.get(filePath) ?? Promise.resolve()).catch(() => {}).then(operation)
    writes.set(filePath, pending)
    return pending.finally(() => { if (writes.get(filePath) === pending) writes.delete(filePath) })
  }
  return {
    async read({ resource }) {
      const definition = definitionFor(resource)
      if (definition.type === 'runtime_status') return { resource, type: definition.type, data: null }
      if (definition.defaultOnly) return { resource, writable: false, data: definition.fallback }
      const directory = definition.location === 'storage' ? storageDir : configDir
      const data = definition.text
        ? await readText(path.join(directory, definition.fileName), definition.fallback ?? '')
        : await readJson(path.join(directory, definition.fileName), definition.array ? [] : {}, clock)
      return { resource, fileName: definition.fileName, writable: definition.writable, data: redactSecrets(data) }
    },
    async write({ resource, patch }) {
      const definition = definitionFor(resource)
      if (!definition.writable) throw invalidParams(`Config resource is read-only: ${resource}`)
      if (definition.text ? typeof patch !== 'string' : definition.array ? !Array.isArray(patch) : !isPlainObject(patch)) throw invalidParams(`Invalid patch for config resource: ${resource}`)
      const directory = definition.location === 'storage' ? storageDir : configDir
      const filePath = path.join(directory, definition.fileName)
      return serialize(filePath, async () => {
        const next = definition.text || definition.array ? patch : deepMerge(await readJson(filePath, {}, clock), patch)
        if (definition.text) await writeText(filePath, next)
        else await writeJson(filePath, next)
        return this.read({ resource })
      })
    },
    async close() {}
  }
}
