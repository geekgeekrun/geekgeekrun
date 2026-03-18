/**
 * llm-rubric.mjs
 *
 * LLM-based resume evaluation using Rubric (knockouts + dimensions).
 * Used when resumeLlmConfig.rubric is present in job filter.
 */

import { readConfigFile } from './runtime-file-utils.mjs'
import { debug as logDebug, info as logInfo, warn as logWarn, error as logError } from './logger.mjs'

const RESUME_TEXT_MAX_CHARS = 3500
const LOG = '[llm-rubric]'

/**
 * 将 providers 数组展开为 flat model 列表，每个 model 携带所属 provider 的 baseURL/apiKey。
 * 同时兼容旧格式（直接含 models 字段的配置）。
 * @param {object} config
 * @returns {Array<{ id, baseURL, apiKey, model, enabled, thinking, name }>}
 */
function flattenModels (config) {
  if (Array.isArray(config.providers)) {
    return config.providers.flatMap((p) =>
      (p.models ?? []).map((m) => ({
        ...m,
        baseURL: p.baseURL,
        apiKey: p.apiKey
      }))
    )
  }
  // 旧格式兜底（迁移前可能在 runtime 里读到）
  if (Array.isArray(config.models)) {
    return config.models
  }
  return []
}

/**
 * 获取启用的招聘端 LLM 配置，从 boss-llm.json 按 purpose 选取模型。
 * boss-llm.json 格式: { providers: [...], purposeDefaultModelId: { resume_screening: "uuid" } }
 * @param {string} [purpose='resume_screening'] - 用途 key
 * @param {string|null} [preferModelId=null] - 指定模型 id（优先）
 * @returns {{ baseURL: string, apiKey: string, model: string, thinking?: { enabled: boolean, budget: number } } | null}
 */
export function getEnabledLlmClient (purpose = 'resume_screening', preferModelId = null) {
  const raw = readConfigFile('boss-llm.json')
  const models = flattenModels(raw ?? {})
  if (models.length === 0) return null

  // 指定 modelId：优先使用（需启用）
  if (preferModelId) {
    const preferred = models.find((m) => m.id === preferModelId && m.enabled !== false)
    if (preferred?.baseURL && preferred?.apiKey && preferred?.model) {
      logDebug(LOG, 'use preferred modelId', preferModelId, preferred.model)
      return {
        baseURL: preferred.baseURL,
        apiKey: preferred.apiKey,
        model: preferred.model,
        thinking: preferred.thinking ?? null
      }
    }
    logWarn(LOG, 'preferred modelId not found/enabled', preferModelId)
  }

  // 优先按 purposeDefaultModelId 精确匹配
  const defaultId =
    raw?.purposeDefaultModelId?.[purpose] ?? raw?.purposeDefaultModelId?.['default']
  let selected = defaultId
    ? models.find((m) => m.id === defaultId && m.enabled !== false)
    : null

  // 回退: 找第一个启用的模型
  if (!selected) {
    selected = models.find((m) => m.enabled !== false)
  }

  if (!selected || !selected.baseURL || !selected.apiKey || !selected.model) return null

  logDebug(LOG, 'selected model', { purpose, modelId: selected.id, model: selected.model })
  return {
    baseURL: selected.baseURL,
    apiKey: selected.apiKey,
    model: selected.model,
    thinking: selected.thinking ?? null
  }
}

/**
 * 根据 Rubric 评估简历。
 * @param {string} resumeText - 简历全文
 * @param {{ knockouts?: string[], dimensions?: Array<{ name: string, weight: number, criteria: Record<string, string> }>, passThreshold?: number }} rubricConfig
 * @param {{ modelId?: string | null }} [options]
 * @returns {Promise<{ isPassed: boolean, totalScore: number, reason: string }>} 失败时默认通过
 */
export async function evaluateResumeByRubric (resumeText, rubricConfig, options = {}) {
  const defaultResult = { isPassed: true, totalScore: 0, reason: 'LLM 调用失败，默认通过' }
  const modelId = typeof options?.modelId === 'string' ? options.modelId : null
  const client = getEnabledLlmClient('resume_screening', modelId)
  if (!client) return defaultResult

  const knockouts = Array.isArray(rubricConfig?.knockouts) ? rubricConfig.knockouts : []
  const dimensions = Array.isArray(rubricConfig?.dimensions) ? rubricConfig.dimensions : []
  const passThreshold = typeof rubricConfig?.passThreshold === 'number' ? rubricConfig.passThreshold : 75

  if (dimensions.length === 0) {
    return { isPassed: true, totalScore: 100, reason: '无评分维度，默认通过' }
  }

  const truncatedResume = (resumeText || '（无简历内容）').slice(0, RESUME_TEXT_MAX_CHARS)

  const dimensionsDesc = dimensions
    .map((d) => {
      const criteriaStr = Object.entries(d.criteria || {})
        .map(([k, v]) => `${k}分: ${v}`)
        .join('；')
      return `- ${d.name}（权重${d.weight}%）：${criteriaStr}`
    })
    .join('\n')

  let systemContent = `你是一个招聘筛选助手。请根据以下评分标准对候选人简历进行结构化评估。

【一票否决项】若简历不满足以下任一项，直接返回 knockout_failed: true，无需计算维度分：
${knockouts.length > 0 ? knockouts.map((k) => `- ${k}`).join('\n') : '（无）'}

【评分维度】每个维度打 1/3/5 分，按权重加权得到总分（满100）：
${dimensionsDesc}

请仅以 JSON 格式回复，不要包含其他内容。格式：
{
  "knockout_failed": true或false,
  "knockout_reason": "若不通过则填写原因，否则填空字符串",
  "dimension_scores": { "维度名": 1或3或5, ... },
  "reasoning": "简要判断理由"
}`

  try {
    logInfo(LOG, 'evaluateResumeByRubric start', {
      model: client.model,
      resumeChars: truncatedResume.length,
      dims: dimensions.length,
      knockouts: knockouts.length,
      passThreshold
    })
    const { completes } = await import('@geekgeekrun/utils/gpt-request.mjs')
    const completion = await completes(
      {
        baseURL: client.baseURL,
        apiKey: client.apiKey,
        model: client.model,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      [
        { role: 'system', content: systemContent },
        { role: 'user', content: truncatedResume }
      ]
    )

    const raw = completion?.choices?.[0]?.message?.content?.trim()
    logDebug(LOG, 'evaluateResumeByRubric raw length', raw?.length ?? 0)
    if (!raw) return defaultResult

    const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
    const parsed = JSON.parse(jsonStr)

    if (parsed.knockout_failed === true) {
      return {
        isPassed: false,
        totalScore: 0,
        reason: String(parsed.knockout_reason || parsed.reasoning || '一票否决')
      }
    }

    const scores = parsed.dimension_scores || {}
    let weightedSum = 0
    let totalWeight = 0
    const dimensionResults = []
    for (const d of dimensions) {
      const score = scores[d.name]
      const num = typeof score === 'number' ? Math.min(5, Math.max(1, score)) : 3
      const weight = typeof d.weight === 'number' ? d.weight : 100 / dimensions.length
      weightedSum += (num / 5) * weight
      totalWeight += weight
      dimensionResults.push({ name: d.name, score: num, weight })
    }
    const totalScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0
    const isPassed = totalScore >= passThreshold

    return {
      isPassed,
      totalScore,
      reason: String(parsed.reasoning || ''),
      dimensionResults
    }
  } catch (err) {
    logError(LOG, 'evaluateResumeByRubric error', err?.message || err)
    return { ...defaultResult, reason: `评估异常: ${err?.message || err}` }
  }
}

/**
 * 根据岗位描述（JD）生成 Rubric 结构。
 * @param {string} sourceJd - 岗位描述或招聘要求
 * @param {{ modelId?: string | null }} [options]
 * @returns {Promise<{ rubric: { knockouts: string[], dimensions: Array<{ name: string, weight: number, criteria: Record<string, string> }> } }>}
 */
export async function generateRubricFromJd (sourceJd, options = {}) {
  const defaultRubric = {
    knockouts: [],
    dimensions: [
      { name: '综合匹配度', weight: 100, criteria: { '1': '不符合', '3': '部分符合', '5': '完全符合' } }
    ]
  }
  // 允许为“Rubric 生成”单独指定模型；旧配置未配置 rubric_generation 时，会自动回退到 default/第一个启用模型
  const modelId = typeof options?.modelId === 'string' ? options.modelId : null
  const client = getEnabledLlmClient('rubric_generation', modelId)
  if (!client) return { rubric: defaultRubric }

  const systemContent = `你是一个资深 HR，擅长将招聘需求转化为可量化的候选人评分体系（Rubric）。

请仔细阅读用户提供的岗位描述（JD），从中提取并生成：

1. knockouts（一票否决项）：
   - 不满足任意一项即直接淘汰
   - 数量：根据 JD 实际硬性要求决定，通常 2~4 条
   - 只写岗位明确说明的硬性条件（禁止背景、资质门槛、明确排除项等），不要臆造
   - 每条独立，简洁具体，不超过 30 字

2. dimensions（评分维度）：
   - 数量：根据 JD 核心能力要求决定，通常 3~5 个
   - 每个维度必须对应 JD 中一个独立的、具体的能力方向（如：实验操作能力、研究独立性、沟通表达能力、工具学习能力等）
   - 严禁出现「综合匹配度」「整体匹配」「岗位匹配度」等笼统无意义的维度名称
   - weight 之和必须精确等于 100
   - criteria 必须是具体的行为或成果描述，严禁使用「不符合/部分符合/完全符合」这类无意义模板：
     - "1"：候选人完全不具备该维度的能力或经验（举例说明具体缺失表现）
     - "3"：候选人具备基础能力，但深度或广度不足（举例说明具体不足之处）
     - "5"：候选人在该维度有突出表现，与岗位高度匹配（举例说明具体优秀表现）

仅以 JSON 格式回复，不要包含任何其他文字，不要有 markdown 代码块。格式：
{
  "knockouts": ["否决项1", "否决项2"],
  "dimensions": [
    {
      "name": "维度名称",
      "weight": 30,
      "criteria": {
        "1": "1分的具体行为描述",
        "3": "3分的具体行为描述",
        "5": "5分的具体行为描述"
      }
    }
  ]
}`

  try {
    logInfo(LOG, 'generateRubricFromJd start', { model: client.model, jdChars: String(sourceJd || '').length })
    const { completes } = await import('@geekgeekrun/utils/gpt-request.mjs')
    const completion = await completes(
      {
        baseURL: client.baseURL,
        apiKey: client.apiKey,
        model: client.model,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      },
      [
        { role: 'system', content: systemContent },
        { role: 'user', content: sourceJd || '（请输入岗位描述）' }
      ]
    )
    const raw = completion?.choices?.[0]?.message?.content?.trim()
    logDebug(LOG, 'generateRubricFromJd raw length', raw?.length ?? 0)
    if (!raw) return { rubric: defaultRubric }
    const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')
    const parsed = JSON.parse(jsonStr)

    const knockouts = Array.isArray(parsed.knockouts)
      ? parsed.knockouts.filter((k) => typeof k === 'string').slice(0, 5)
      : []
    let dimensions
    const dimList = Array.isArray(parsed.dimensions) ? parsed.dimensions : []
    const dimCount = Math.min(5, dimList.length) || 1
    dimensions = dimList
      .filter((d) => d && typeof d.name === 'string' && d.criteria && typeof d.criteria === 'object')
      .slice(0, 5)
      .map((d) => ({
        name: String(d.name),
        weight: typeof d.weight === 'number' ? Math.max(0, Math.min(100, d.weight)) : 100 / dimCount,
        criteria: {
          '1': String(d.criteria['1'] || d.criteria[1] || ''),
          '3': String(d.criteria['3'] || d.criteria[3] || ''),
          '5': String(d.criteria['5'] || d.criteria[5] || '')
        }
      }))
    if (dimensions.length === 0) dimensions = defaultRubric.dimensions

    // 归一化权重
    const totalWeight = dimensions.reduce((s, d) => s + (d.weight || 0), 0)
    if (totalWeight > 0) {
      dimensions = dimensions.map((d) => ({
        ...d,
        weight: Math.round((100 * (d.weight || 0)) / totalWeight)
      }))
    }

    return { rubric: { knockouts, dimensions } }
  } catch (err) {
    logError(LOG, 'generateRubricFromJd error', err?.message || err)
    return { rubric: defaultRubric }
  }
}
