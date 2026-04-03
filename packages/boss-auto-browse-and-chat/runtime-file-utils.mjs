import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const defaultBossRecruiterConf = require('./default-config-file/boss-recruiter.json')
const defaultCandidateFilterConf = require('./default-config-file/candidate-filter.json')
const defaultBossCookieStorage = require('./default-storage-file/boss-cookies.json')
const defaultBossLocalStorageStorage = require('./default-storage-file/boss-local-storage.json')

export const configFileNameList = ['boss-recruiter.json', 'candidate-filter.json']

const defaultConfigFileContentMap = {
  'boss-recruiter.json': JSON.stringify(defaultBossRecruiterConf),
  'candidate-filter.json': JSON.stringify(defaultCandidateFilterConf)
}

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const configFolderPath = path.join(runtimeFolderPath, 'config')

export const writeConfigFile = async (fileName, content, { isSync } = {}) => {
  const filePath = path.join(configFolderPath, fileName)
  const fileContent = JSON.stringify(content)
  if (isSync) {
    fs.writeFileSync(filePath, fileContent)
  } else {
    return fsPromise.writeFile(filePath, fileContent)
  }
}

const ensureRuntimeFolderPathExist = () => {
  if (!fs.existsSync(runtimeFolderPath)) {
    fs.mkdirSync(runtimeFolderPath)
  }
  ;['config', 'storage'].forEach(dirPath => {
    if (!fs.existsSync(path.join(runtimeFolderPath, dirPath))) {
      fs.mkdirSync(path.join(runtimeFolderPath, dirPath))
    }
  })
}

export const ensureConfigFileExist = () => {
  ensureRuntimeFolderPathExist()
  configFileNameList.forEach(fileName => {
    if (!fs.existsSync(path.join(configFolderPath, fileName))) {
      fs.writeFileSync(
        path.join(configFolderPath, fileName),
        defaultConfigFileContentMap[fileName]
      )
    }
  })
}

export const readConfigFile = (fileName) => {
  const joinedPath = path.join(configFolderPath, fileName)
  if (!fs.existsSync(joinedPath)) {
    ensureConfigFileExist()
  }

  let o
  try {
    o = JSON.parse(fs.readFileSync(joinedPath))
  } catch {
    if (fs.existsSync(joinedPath)) fs.unlinkSync(joinedPath)
    if (defaultConfigFileContentMap[fileName]) {
      ensureConfigFileExist()
      o = JSON.parse(defaultConfigFileContentMap[fileName])
    } else {
      o = null
    }
  }

  return o
}

export const storageFilePath = path.join(runtimeFolderPath, 'storage')
export const storageFileNameList = ['boss-cookies.json', 'boss-local-storage.json']

const defaultStorageFileContentMap = {
  'boss-cookies.json': JSON.stringify(defaultBossCookieStorage),
  'boss-local-storage.json': JSON.stringify(defaultBossLocalStorageStorage)
}

export const ensureStorageFileExist = () => {
  ensureRuntimeFolderPathExist()
  storageFileNameList.forEach(fileName => {
    if (!fs.existsSync(path.join(storageFilePath, fileName))) {
      fs.writeFileSync(
        path.join(storageFilePath, fileName),
        defaultStorageFileContentMap[fileName]
      )
    }
  })
}

export const readStorageFile = (fileName, { isJson } = {}) => {
  isJson = isJson ?? true
  const joinedPath = path.join(storageFilePath, fileName)

  if (!fs.existsSync(joinedPath)) {
    ensureStorageFileExist()
  }

  let o
  try {
    const content = fs.readFileSync(joinedPath)
    if (isJson) {
      o = JSON.parse(content)
    } else {
      o = content.toString()
    }
  } catch {
    if (fs.existsSync(joinedPath)) fs.unlinkSync(joinedPath)
    ensureStorageFileExist()
    if (isJson) {
      o = JSON.parse(defaultStorageFileContentMap[fileName] ?? 'null')
    } else {
      o = defaultStorageFileContentMap[fileName] ?? null
    }
  }

  return o
}

export const writeStorageFile = async (fileName, content, { isJson } = {}) => {
  isJson = isJson ?? true
  const filePath = path.join(storageFilePath, fileName)
  let fileContent
  if (isJson) {
    fileContent = JSON.stringify(content)
  } else {
    fileContent = content
  }
  return fsPromise.writeFile(filePath, fileContent)
}

const bossJobsConfigFileName = 'boss-jobs-config.json'

export const readBossJobsConfig = () => {
  ensureRuntimeFolderPathExist()
  const filePath = path.join(configFolderPath, bossJobsConfigFileName)
  if (!fs.existsSync(filePath)) {
    return { jobs: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return { jobs: [] }
  }
}

export const writeBossJobsConfig = async (config) => {
  ensureRuntimeFolderPathExist()
  const filePath = path.join(configFolderPath, bossJobsConfigFileName)
  return fsPromise.writeFile(filePath, JSON.stringify(config))
}

/**
 * 将 boss-jobs-config 的 filter（含 *Enabled 字段）转换为 candidate-filter 格式，
 * 供 filterCandidates / 推荐页 / 沟通页 preFilter 使用。
 */
function jobFilterToCandidateFilter (jobFilter) {
  if (!jobFilter || typeof jobFilter !== 'object') {
    return {}
  }
  const f = jobFilter
  const expectCityList = f.expectCityEnabled && Array.isArray(f.expectCityList)
    ? f.expectCityList
    : []
  const expectEducationRegExpStr = f.expectEducationEnabled && typeof f.expectEducationRegExpStr === 'string'
    ? f.expectEducationRegExpStr
    : ''
  const [workMinDefault, workMaxDefault] = Array.isArray(f.expectWorkExpRange) && f.expectWorkExpRange.length >= 2
    ? f.expectWorkExpRange
    : [0, 99]
  const expectWorkExpRange = [
    f.expectWorkExpMinEnabled ? workMinDefault : 0,
    f.expectWorkExpMaxEnabled ? workMaxDefault : 99
  ]
  const [salMinDefault, salMaxDefault] = Array.isArray(f.expectSalaryRange) && f.expectSalaryRange.length >= 2
    ? f.expectSalaryRange
    : [0, 0]
  const expectSalaryRange = [
    f.expectSalaryMinEnabled ? salMinDefault : 0,
    f.expectSalaryMaxEnabled ? salMaxDefault : 0
  ]
  return {
    expectCityList,
    expectEducationRegExpStr,
    expectWorkExpRange,
    expectSalaryRange,
    expectSalaryWhenNegotiable: f.expectSalaryWhenNegotiable || 'exclude',
    expectSkillKeywords: [],
    blockCandidateNameRegExpStr: '',
    skipViewedCandidates: false
  }
}

/**
 * 将 boss-jobs-config 的 filter 转换为 chatPage.filter 格式（简历筛选）。
 * 优先级：resumeLlmEnabled（rubric）> resumeLlmEnabled（rule）> resumeKeywordsEnabled > resumeRegExpEnabled
 */
function jobFilterToChatPageFilter (jobFilter) {
  if (!jobFilter || typeof jobFilter !== 'object') {
    return { mode: 'keywords', keywordList: [], llmRule: '', llmConfig: null }
  }
  const f = jobFilter
  // resumeLlmConfig（Rubric 模式）优先
  if (f.resumeLlmEnabled && f.resumeLlmConfig?.rubric) {
    return {
      mode: 'llm',
      keywordList: [],
      llmRule: f.resumeLlmConfig.sourceJd || '',
      llmConfig: f.resumeLlmConfig
    }
  }
  if (f.resumeLlmEnabled && typeof f.resumeLlmRule === 'string') {
    return { mode: 'llm', keywordList: [], llmRule: f.resumeLlmRule, llmConfig: null }
  }
  if (f.resumeKeywordsEnabled && Array.isArray(f.resumeKeywords)) {
    return { mode: 'keywords', keywordList: f.resumeKeywords, llmRule: '', llmConfig: null }
  }
  // resumeRegExpEnabled：chat-page 暂无 regex 模式，暂不筛选（全部通过），后续可扩展
  if (f.resumeRegExpEnabled && typeof f.resumeRegExpStr === 'string' && f.resumeRegExpStr) {
    return { mode: 'keywords', keywordList: [], llmRule: '', llmConfig: null }
  }
  return { mode: 'keywords', keywordList: [], llmRule: '', llmConfig: null }
}

export const getMergedJobConfig = (jobId) => {
  const recruiterConfig = readConfigFile('boss-recruiter.json') || {}
  const candidateFilterConfig = readConfigFile('candidate-filter.json') || {}

  if (!jobId) {
    return {
      ...recruiterConfig,
      candidateFilter: candidateFilterConfig
    }
  }

  const jobsConfig = readBossJobsConfig()
  const jobEntry = (jobsConfig.jobs || []).find(j => (j.jobId || j.id) === jobId)
  if (!jobEntry) {
    return {
      ...recruiterConfig,
      candidateFilter: candidateFilterConfig
    }
  }

  const jobFilter = jobEntry.filter
  const candidateFilter = jobFilterToCandidateFilter(jobFilter)
  const chatPageFilter = jobFilterToChatPageFilter(jobFilter)

  return {
    ...recruiterConfig,
    candidateFilter,
    chatPage: {
      ...(recruiterConfig.chatPage || {}),
      preFilter: candidateFilter,
      filter: {
        ...(recruiterConfig.chatPage?.filter || {}),
        ...chatPageFilter
      }
    },
    _jobMeta: { jobId: jobEntry.jobId || jobEntry.id, jobName: jobEntry.jobName || jobEntry.name }
  }
}

// ── 招聘端 LLM 配置（boss-llm.json）───────────────────────────────────────────

const bossLlmConfigFileName = 'boss-llm.json'
const defaultBossLlmConfig = { providers: [], purposeDefaultModelId: {} }

/**
 * 将旧格式（flat models 数组）迁移为新格式（providers 数组）。
 * 按 baseURL 分组，同一 baseURL 的模型归入同一 provider。
 */
function migrateFlatModelsToProviders (oldConfig) {
  const grouped = {}
  for (const m of oldConfig.models) {
    const key = m.baseURL ?? ''
    if (!grouped[key]) {
      grouped[key] = {
        id: crypto.randomUUID(),
        name: m.baseURL ?? '',
        baseURL: m.baseURL ?? '',
        apiKey: m.apiKey ?? '',
        models: []
      }
    }
    const { baseURL: _b, apiKey: _a, ...modelFields } = m
    grouped[key].models.push(modelFields)
  }
  return {
    providers: Object.values(grouped),
    purposeDefaultModelId: oldConfig.purposeDefaultModelId ?? {}
  }
}

export const readBossLlmConfig = () => {
  ensureRuntimeFolderPathExist()
  const filePath = path.join(configFolderPath, bossLlmConfigFileName)
  if (!fs.existsSync(filePath)) {
    return { ...defaultBossLlmConfig }
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return { ...defaultBossLlmConfig }
  }
  // 旧格式迁移：有 models 字段但无 providers 字段
  if (Array.isArray(raw.models) && !Array.isArray(raw.providers)) {
    const migrated = migrateFlatModelsToProviders(raw)
    // 写回文件，完成一次性迁移
    try {
      fs.writeFileSync(filePath, JSON.stringify(migrated))
    } catch {
      // 写回失败不影响本次使用
    }
    return migrated
  }
  // 兼容/修复：为 providers/models 补齐缺失字段（尤其是 model.id）
  if (!Array.isArray(raw.providers)) {
    return { ...defaultBossLlmConfig }
  }

  let mutated = false
  for (const p of raw.providers) {
    if (!p || typeof p !== 'object') continue
    if (!Array.isArray(p.models)) {
      p.models = []
      mutated = true
    }
    for (const m of p.models) {
      if (!m || typeof m !== 'object') continue
      if (typeof m.id !== 'string' || !m.id) {
        m.id = crypto.randomUUID()
        mutated = true
      }
      // enabled 默认 true（不写也视为启用），但旧数据可能缺失
      if (typeof m.enabled !== 'boolean') {
        m.enabled = true
        mutated = true
      }
      if (!m.thinking || typeof m.thinking !== 'object') {
        m.thinking = { enabled: false, budget: 2048 }
        mutated = true
      } else {
        if (typeof m.thinking.enabled !== 'boolean') {
          m.thinking.enabled = false
          mutated = true
        }
        if (typeof m.thinking.budget !== 'number') {
          m.thinking.budget = 2048
          mutated = true
        }
      }
    }
  }

  if (mutated) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(raw))
    } catch {
      // ignore
    }
  }

  return raw
}

export const writeBossLlmConfig = async (config) => {
  ensureRuntimeFolderPathExist()
  const filePath = path.join(configFolderPath, bossLlmConfigFileName)
  return fsPromise.writeFile(filePath, JSON.stringify(config))
}

