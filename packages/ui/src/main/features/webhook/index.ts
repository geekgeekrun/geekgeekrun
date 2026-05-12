import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface WebhookConfig {
  enabled: boolean
  url: string
  method: 'POST' | 'PUT' | 'PATCH'
  headers: Record<string, string>
  /** 发送模式：batch=轮次结束汇总发送，realtime=每打招呼后立即发送一条 */
  sendMode?: 'batch' | 'realtime'
  /** 请求体格式，multipart 时每条候选人为一个请求（支持直传 Paperless 等） */
  contentType?: 'application/json' | 'multipart/form-data'
  payloadOptions: {
    includeBasicInfo: boolean
    includeFilterReason: boolean
    includeLlmConclusion: boolean
    includeResume: 'none' | 'path' | 'base64'
  }
  /** 失败重试次数，0 不重试 */
  retryTimes?: number
  /** 首次重试延迟（毫秒），之后指数退避 */
  retryDelayMs?: number
  /** 最终失败时是否写入本地队列文件，便于后续重发 */
  queueFileOnFailure?: boolean
}

export interface CandidateBasicInfo {
  name: string
  education?: string
  workExpYears?: number
  city?: string
  salary?: string
  skills?: string[]
}

export interface CandidateFilterReport {
  matched: boolean
  matchedRules?: string[]
  skippedReason?: string
  score?: number
}

export interface CandidateResult {
  basicInfo?: CandidateBasicInfo
  filterReport?: CandidateFilterReport
  llmConclusion?: string
  resumeFile?: {
    path?: string
    base64?: string
    filename?: string
  }
}

export interface WebhookPayload {
  runId: string
  timestamp: string
  summary: {
    total: number
    matched: number
    skipped: number
  }
  candidates: CandidateResult[]
}

const DEFAULT_CONFIG: Partial<WebhookConfig> = {
  sendMode: 'batch',
  contentType: 'application/json',
  retryTimes: 3,
  retryDelayMs: 1000,
  queueFileOnFailure: false
}

export function normalizeWebhookConfig(config: Partial<WebhookConfig> | null): WebhookConfig | null {
  if (!config || !config.url) return null
  return {
    enabled: config.enabled ?? false,
    url: config.url,
    method: config.method ?? 'POST',
    headers: config.headers ?? {},
    sendMode: config.sendMode ?? 'batch',
    contentType: config.contentType ?? 'application/json',
    payloadOptions: {
      includeBasicInfo: config.payloadOptions?.includeBasicInfo ?? true,
      includeFilterReason: config.payloadOptions?.includeFilterReason ?? true,
      includeLlmConclusion: config.payloadOptions?.includeLlmConclusion ?? true,
      includeResume: config.payloadOptions?.includeResume ?? 'path'
    },
    retryTimes: config.retryTimes ?? DEFAULT_CONFIG.retryTimes,
    retryDelayMs: config.retryDelayMs ?? DEFAULT_CONFIG.retryDelayMs,
    queueFileOnFailure: config.queueFileOnFailure ?? false
  }
}

function filterOneCandidate(
  config: WebhookConfig,
  c: CandidateResult
): Partial<CandidateResult> {
  const result: Partial<CandidateResult> = {}
  if (config.payloadOptions.includeBasicInfo) {
    result.basicInfo = c.basicInfo
  }
  if (config.payloadOptions.includeFilterReason) {
    result.filterReport = c.filterReport
  }
  if (config.payloadOptions.includeLlmConclusion && c.llmConclusion) {
    result.llmConclusion = c.llmConclusion
  }
  if (config.payloadOptions.includeResume !== 'none' && c.resumeFile) {
    if (config.payloadOptions.includeResume === 'path') {
      result.resumeFile = { path: c.resumeFile.path, filename: c.resumeFile.filename }
    } else if (config.payloadOptions.includeResume === 'base64' && c.resumeFile.path) {
      try {
        const fileBuffer = fs.readFileSync(c.resumeFile.path)
        result.resumeFile = {
          base64: fileBuffer.toString('base64'),
          filename: c.resumeFile.filename
        }
      } catch {
        result.resumeFile = { path: c.resumeFile.path, filename: c.resumeFile.filename }
      }
    } else if (config.payloadOptions.includeResume === 'base64' && c.resumeFile.base64) {
      result.resumeFile = { base64: c.resumeFile.base64, filename: c.resumeFile.filename }
    }
  }
  return result
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 写入失败队列文件（JSONL），便于后续重试或脚本重发 */
function appendToQueueFile(payload: WebhookPayload, storageDir: string): void {
  try {
    const queuePath = path.join(storageDir, 'webhook-failed-queue.jsonl')
    const line = JSON.stringify({ ts: new Date().toISOString(), payload }) + '\n'
    fs.appendFileSync(queuePath, line)
    console.log(`[webhook] 已写入失败队列: ${queuePath}`)
  } catch (e) {
    console.error('[webhook] 写入失败队列失败', e)
  }
}

async function doOneRequest(
  config: WebhookConfig,
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | FormData
): Promise<{ status: number; body: string }> {
  const isFormData = body instanceof FormData
  const finalHeaders = { ...headers }
  if (isFormData) {
    delete finalHeaders['Content-Type']
  } else {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json'
  }
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body as BodyInit
  })
  const responseBody = await response.text()
  return { status: response.status, body: responseBody }
}

async function sendOneRequestWithRetry(
  config: WebhookConfig,
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | FormData,
  logPrefix: string,
  storageDir: string,
  payloadForQueue: WebhookPayload | null
): Promise<{ status: number; body: string }> {
  const times = Math.max(0, config.retryTimes ?? 0)
  let lastError: Error | null = null
  let lastResult: { status: number; body: string } | null = null
  let delay = config.retryDelayMs ?? 1000

  for (let attempt = 0; attempt <= times; attempt++) {
    try {
      lastResult = await doOneRequest(config, method, url, headers, body)
      if (lastResult.status >= 200 && lastResult.status < 300) {
        if (attempt > 0) {
          console.log(`[webhook] ${logPrefix} 重试第 ${attempt} 次成功，HTTP ${lastResult.status}`)
        }
        return lastResult
      }
      if (lastResult.status < 500) {
        return lastResult
      }
      lastError = new Error(`HTTP ${lastResult.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < times) {
      console.log(`[webhook] ${logPrefix} 第 ${attempt + 1} 次失败，${delay}ms 后重试: ${lastError?.message}`)
      await sleep(delay)
      delay *= 2
    }
  }

  if (config.queueFileOnFailure && payloadForQueue) {
    appendToQueueFile(payloadForQueue, storageDir)
  }
  if (lastResult) return lastResult
  throw lastError ?? new Error('Unknown error')
}

/** 获取 storage 目录（用于失败队列），主进程/worker 可传入 options.storageDir 避免异步 */
export async function getWebhookStorageDir(): Promise<string> {
  try {
    const { storageFilePath } = (await import(
      '@geekgeekrun/boss-auto-browse-and-chat/runtime-file-utils.mjs'
    )) as { storageFilePath: string }
    return storageFilePath
  } catch {
    return path.join(os.homedir(), '.geekgeekrun', 'storage')
  }
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: WebhookPayload,
  options?: { storageDir?: string }
): Promise<{ status: number; body: string }> {
  const normalized = normalizeWebhookConfig(config) as WebhookConfig
  const storageDir = options?.storageDir ?? (await getWebhookStorageDir())
  const headers = { ...normalized.headers }

  const filteredCandidates = payload.candidates.map((c) => filterOneCandidate(normalized, c))

  const runId = payload.runId
  const timestamp = payload.timestamp
  const summary = payload.summary

  if (normalized.contentType === 'multipart/form-data') {
    let lastStatus = 0
    let lastBody = ''
    for (let i = 0; i < filteredCandidates.length; i++) {
      const singleSummary = {
        total: 1,
        matched: filteredCandidates[i].filterReport?.matched !== false ? 1 : 0,
        skipped: filteredCandidates[i].filterReport?.matched === false ? 1 : 0
      }
      const form = new FormData()
      form.append('runId', runId)
      form.append('timestamp', timestamp)
      form.append('summary', JSON.stringify(singleSummary))
      form.append('candidate', JSON.stringify(filteredCandidates[i]))
      const c = payload.candidates[i]
      if (
        normalized.payloadOptions.includeResume !== 'none' &&
        c?.resumeFile?.path &&
        fs.existsSync(c.resumeFile.path)
      ) {
        const buf = fs.readFileSync(c.resumeFile.path)
        const filename = c.resumeFile.filename ?? path.basename(c.resumeFile.path)
        form.append('document', new Blob([buf]), filename)
      }
      const singlePayload: WebhookPayload = {
        runId,
        timestamp,
        summary: singleSummary,
        candidates: [payload.candidates[i]]
      }
      console.log(
        `[webhook] 发送 multipart ${normalized.method} ${normalized.url}，第 ${i + 1}/${filteredCandidates.length} 条`
      )
      const res = await sendOneRequestWithRetry(
        normalized,
        normalized.method,
        normalized.url,
        headers,
        form,
        `multipart #${i + 1}`,
        storageDir,
        singlePayload
      )
      lastStatus = res.status
      lastBody = res.body
      const preview = res.body.length > 200 ? res.body.slice(0, 200) + '...' : res.body
      console.log(`[webhook] 响应 HTTP ${res.status}，body: ${preview}`)
    }
    return { status: lastStatus, body: lastBody }
  }

  const body = JSON.stringify({
    runId,
    timestamp,
    summary,
    candidates: filteredCandidates
  })
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  console.log(
    `[webhook] 发送 ${normalized.method} ${normalized.url}，runId=${runId}，candidates=${filteredCandidates.length}`
  )
  const result = await sendOneRequestWithRetry(
    normalized,
    normalized.method,
    normalized.url,
    headers,
    body,
    'batch',
    storageDir,
    payload
  )
  const bodyPreview =
    result.body.length > 200 ? result.body.slice(0, 200) + '...' : result.body
  console.log(`[webhook] 响应 HTTP ${result.status}，body: ${bodyPreview}`)
  return result
}

export function buildMockPayload(): WebhookPayload {
  return {
    runId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
    summary: { total: 2, matched: 1, skipped: 1 },
    candidates: [
      {
        basicInfo: {
          name: '张三（测试）',
          education: '本科',
          workExpYears: 3,
          city: '北京',
          salary: '15-25K',
          skills: ['Vue', 'React', 'TypeScript']
        },
        filterReport: {
          matched: true,
          matchedRules: ['education', 'workExp', 'skills'],
          score: 85
        },
        llmConclusion: '候选人技能与岗位匹配度较高，建议优先沟通。'
      },
      {
        basicInfo: {
          name: '李四（测试）',
          education: '大专',
          workExpYears: 1,
          city: '上海',
          salary: '8-12K',
          skills: ['HTML', 'CSS']
        },
        filterReport: {
          matched: false,
          skippedReason: 'education_not_match'
        }
      }
    ]
  }
}

/** 从 SQLite 查询最近一轮联系人，组装为 WebhookPayload（用于手动触发真实数据） */
export async function buildPayloadFromDb(dbPath: string): Promise<WebhookPayload | null> {
  const { initDb } = await import('@geekgeekrun/sqlite-plugin')
  const {
    getRecentCandidateContactLogs,
    queryCandidateByEncryptId
  } = await import('@geekgeekrun/sqlite-plugin/dist/handlers')
  const ds = await initDb(dbPath)
  const logs = await getRecentCandidateContactLogs(ds, 50)
  if (logs.length === 0) {
    return null
  }
  const candidates: CandidateResult[] = []
  for (const { encryptGeekId } of logs) {
    const info = await queryCandidateByEncryptId(ds, encryptGeekId)
    if (!info) continue
    const skills = info.skills ? (info.skills.trim() ? info.skills.split(/\s*[,，]\s*/) : []) : undefined
    candidates.push({
      basicInfo: {
        name: info.geekName,
        education: info.educationLevel ?? undefined,
        workExpYears: info.workExpYears != null ? Number(info.workExpYears) : undefined,
        city: info.city ?? undefined,
        salary: info.salaryExpect ?? undefined,
        skills
      }
    })
  }
  if (candidates.length === 0) {
    return null
  }
  const runId = `manual-${Date.now()}`
  const timestamp = new Date().toISOString()
  return {
    runId,
    timestamp,
    summary: { total: candidates.length, matched: candidates.length, skipped: 0 },
    candidates
  }
}
