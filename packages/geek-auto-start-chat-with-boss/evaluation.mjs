import { parseSalary } from "@geekgeekrun/sqlite-plugin/dist/utils/parser.js"
import { hasIntersection } from '@geekgeekrun/utils/number.mjs'
import {
  JobDetailRegExpMatchLogic,
  MarkAsNotSuitOp,
  SalaryCalculateWay,
  StrategyScopeOptionWhenMarkJobNotMatch
} from '@geekgeekrun/sqlite-plugin/dist/enums.js'
import { activeDescList } from './constant.mjs'

export const EvaluationRejectReason = {
  COMPANY_NAME_BLOCKED: 'companyName',
  BOSS_INACTIVE: 'active',
  CITY_NOT_MATCH: 'city',
  WORK_EXP_NOT_MATCH: 'workExp',
  JOB_DETAIL_NOT_MATCH: 'jobDetail',
  TECH_STACK_NOT_MATCH: 'techStack',
  SALARY_NOT_MATCH: 'salary',
  EXCLUSION_KEYWORD_HIT: 'exclusionKeyword',
  COMBINED_SCORE_BELOW_THRESHOLD: 'combinedScoreBelowThreshold'
}

export function createEvaluationResult ({
  eligible = true,
  reasons = [],
  hardReject = false,
  matchScore = 1,
  signals = {}
} = {}) {
  return {
    eligible,
    reasons,
    hardReject,
    matchScore,
    signals
  }
}

export function createEvaluationConfig ({
  expectCityList = [],
  expectCityNotMatchStrategy = MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkJobCityNotMatch = StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  
  expectSalaryLow = null,
  expectSalaryHigh = null,
  expectSalaryCalculateWay = SalaryCalculateWay.MONTH_SALARY,
  expectSalaryNotMatchStrategy = MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkSalaryNotMatch = StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  
  expectWorkExpList = [],
  expectWorkExpNotMatchStrategy = MarkAsNotSuitOp.NO_OP,
  strategyScopeOptionWhenMarkJobWorkExpNotMatch = StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB,
  
  expectJobNameRegExpStr = '',
  expectJobTypeRegExpStr = '',
  expectJobDescRegExpStr = '',
  jobDetailRegExpMatchLogic = JobDetailRegExpMatchLogic.EVERY,
  jobNotMatchStrategy = MarkAsNotSuitOp.NO_OP,
  
  blockCompanyNameRegExp = null,
  blockCompanyNameRegMatchStrategy = MarkAsNotSuitOp.NO_OP,
  
  markAsNotActiveSelectedTimeRange = 7,
  jobNotActiveStrategy = MarkAsNotSuitOp.NO_OP,

  // strict city mode
  cityMode = 'soft',

  // combined matching
  combinedMatching = null,
  searchSourceRequireTechStack = false,
  searchSourceTechStackRegExpStr = ''
} = {}) {
  return {
    expectCityList,
    expectCityNotMatchStrategy,
    strategyScopeOptionWhenMarkJobCityNotMatch,
    
    expectSalaryLow,
    expectSalaryHigh,
    expectSalaryCalculateWay,
    expectSalaryNotMatchStrategy,
    strategyScopeOptionWhenMarkSalaryNotMatch,
    
    expectWorkExpList,
    expectWorkExpNotMatchStrategy,
    strategyScopeOptionWhenMarkJobWorkExpNotMatch,
    
    expectJobNameRegExpStr,
    expectJobTypeRegExpStr,
    expectJobDescRegExpStr,
    jobDetailRegExpMatchLogic,
    jobNotMatchStrategy,
    
    blockCompanyNameRegExp,
    blockCompanyNameRegMatchStrategy,
    
    markAsNotActiveSelectedTimeRange,
    jobNotActiveStrategy,

    cityMode,
    combinedMatching,
    searchSourceRequireTechStack,
    searchSourceTechStackRegExpStr
  }
}

// ─── Combined Matching Helpers ────────────────────────────────────────────────

/**
 * Expand a term using synonym groups.
 * Returns an array of terms (the original + all synonyms from any matching group).
 */
function expandWithSynonyms (term, synonymGroups) {
  if (!synonymGroups?.length) {
    return [term]
  }
  const lowerTerm = term.toLowerCase()
  const expanded = new Set([term])
  for (const group of synonymGroups) {
    if (!Array.isArray(group)) continue
    const lowerGroup = group.map(s => (s ?? '').toLowerCase())
    if (lowerGroup.includes(lowerTerm)) {
      for (const synonym of group) {
        expanded.add(synonym)
      }
    }
  }
  return Array.from(expanded)
}

/**
 * Check if any of the keywords (after synonym expansion) appear in the text.
 * Returns true if at least one keyword matches.
 */
function matchKeywordsInText (keywords, text, synonymGroups) {
  if (!keywords?.length || !text) {
    return false
  }
  const lowerText = text.toLowerCase()
  for (const keyword of keywords) {
    if (!keyword?.trim()) continue
    const expandedTerms = expandWithSynonyms(keyword.trim(), synonymGroups)
    for (const term of expandedTerms) {
      if (lowerText.includes(term.toLowerCase())) {
        return true
      }
    }
  }
  return false
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isWordLikeChar(char) {
  return !!char && /[\p{L}\p{N}]/u.test(char)
}

function containsAsciiWord(keyword) {
  return /[A-Za-z0-9]/.test(keyword)
}

function matchesKeywordWithContext(text, keyword) {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword) {
    return false
  }

  if (containsAsciiWord(normalizedKeyword)) {
    const regExp = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedKeyword)}($|[^\\p{L}\\p{N}])`, 'iu')
    return regExp.test(text)
  }

  let startIndex = 0
  while (startIndex < text.length) {
    const hitIndex = text.indexOf(normalizedKeyword, startIndex)
    if (hitIndex === -1) {
      return false
    }

    const prevChar = hitIndex > 0 ? text[hitIndex - 1] : ''
    const nextChar = text[hitIndex + normalizedKeyword.length] ?? ''
    const hasBoundaryBefore = !isWordLikeChar(prevChar)
    const hasBoundaryAfter = !isWordLikeChar(nextChar)

    if (hasBoundaryBefore || hasBoundaryAfter) {
      return true
    }

    const suffix = text.slice(hitIndex + normalizedKeyword.length, hitIndex + normalizedKeyword.length + 4)
    if (/^(工程师|开发|岗位|工作|职责|经验|方向|经理|专员|支持|测试|运营|运维|产品)/u.test(suffix)) {
      return true
    }

    startIndex = hitIndex + normalizedKeyword.length
  }

  return false
}

/**
 * Check if any exclusion keyword matches the text.
 * Returns the matched keyword or null.
 */
function checkExclusionKeywords (excludeKeywords, text) {
  if (!excludeKeywords?.length || !text) {
    return null
  }
  const normalizedText = text.toLowerCase()
  for (const keyword of excludeKeywords) {
    if (!keyword?.trim()) continue
    if (matchesKeywordWithContext(normalizedText, keyword.toLowerCase())) {
      return keyword
    }
  }
  return null
}

/**
 * Compute a combined match score for a job.
 * Returns { score, exclusionHit, exclusionDetail, signals }
 */
export function computeCombinedMatchScore (jobInfo, combinedMatchingConfig, regexTestResult) {
  const {
    includeKeywords = {},
    excludeKeywords = {},
    synonymGroups = [],
    fieldWeights = { title: 1, positionType: 1, description: 1, regex: 0.5 }
  } = combinedMatchingConfig

  const titleText = jobInfo?.jobName?.replace(/\n/g, '') ?? ''
  const positionTypeText = jobInfo?.positionName?.replace(/\n/g, '') ?? ''
  const descriptionText = jobInfo?.postDescription?.replace(/\n/g, '') ?? ''

  // ── Exclusion check ──
  const excludeTitleKeywords = Array.isArray(excludeKeywords.title) ? excludeKeywords.title : []
  const excludePositionTypeKeywords = Array.isArray(excludeKeywords.positionType) ? excludeKeywords.positionType : []
  const excludeDescriptionKeywords = Array.isArray(excludeKeywords.description) ? excludeKeywords.description : []

  let exclusionHit = null
  let exclusionDetail = null

  exclusionHit = checkExclusionKeywords(excludeTitleKeywords, titleText)
  if (exclusionHit) {
    exclusionDetail = { field: 'title', keyword: exclusionHit }
  }
  if (!exclusionHit) {
    exclusionHit = checkExclusionKeywords(excludePositionTypeKeywords, positionTypeText)
    if (exclusionHit) {
      exclusionDetail = { field: 'positionType', keyword: exclusionHit }
    }
  }
  if (!exclusionHit) {
    exclusionHit = checkExclusionKeywords(excludeDescriptionKeywords, descriptionText)
    if (exclusionHit) {
      exclusionDetail = { field: 'description', keyword: exclusionHit }
    }
  }

  if (exclusionHit) {
    return {
      score: 0,
      exclusionHit: true,
      exclusionDetail,
      signals: { exclusion: exclusionDetail }
    }
  }

  // ── Inclusion scoring ──
  const includeTitleKeywords = Array.isArray(includeKeywords.title) ? includeKeywords.title : []
  const includePositionTypeKeywords = Array.isArray(includeKeywords.positionType) ? includeKeywords.positionType : []
  const includeDescriptionKeywords = Array.isArray(includeKeywords.description) ? includeKeywords.description : []

  let score = 0
  const signals = {}

  const titleWeight = fieldWeights.title ?? 1
  const positionTypeWeight = fieldWeights.positionType ?? 1
  const descriptionWeight = fieldWeights.description ?? 1
  const regexWeight = fieldWeights.regex ?? 0.5

  if (includeTitleKeywords.length > 0) {
    const titleHit = matchKeywordsInText(includeTitleKeywords, titleText, synonymGroups)
    if (titleHit) {
      score += titleWeight
      signals.titleHit = true
    }
  }

  if (includePositionTypeKeywords.length > 0) {
    const positionTypeHit = matchKeywordsInText(includePositionTypeKeywords, positionTypeText, synonymGroups)
    if (positionTypeHit) {
      score += positionTypeWeight
      signals.positionTypeHit = true
    }
  }

  if (includeDescriptionKeywords.length > 0) {
    const descriptionHit = matchKeywordsInText(includeDescriptionKeywords, descriptionText, synonymGroups)
    if (descriptionHit) {
      score += descriptionWeight
      signals.descriptionHit = true
    }
  }

  // Regex contributes bonus
  if (regexTestResult) {
    score += regexWeight
    signals.regexHit = true
  }

  return {
    score,
    exclusionHit: false,
    exclusionDetail: null,
    signals
  }
}

// ─── Existing Helpers ─────────────────────────────────────────────────────────

export function checkIfSalarySuit (salaryDesc, config) {
  const {
    expectSalaryLow,
    expectSalaryHigh,
    expectSalaryCalculateWay
  } = config
  const isSalaryFilterEnabled = [expectSalaryLow, expectSalaryHigh].some((value) => {
    if ([null, undefined, ''].includes(value)) {
      return false
    }
    return !Number.isNaN(parseFloat(String(value)))
  })
  
  const salaryData = parseSalary(salaryDesc)
  
  if (!salaryData.high || !salaryData.low) {
    return isSalaryFilterEnabled
      ? { suit: false, reason: 'invalid_salary_data' }
      : { suit: true, reason: null }
  }
  
  if (expectSalaryCalculateWay === SalaryCalculateWay.MONTH_SALARY) {
    let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
    if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
      ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
    }
    const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null]
    const suit = hasIntersection(theirSalaryInterval, ourSalaryInterval)
    return { suit, reason: suit ? null : 'no_intersection' }
  }
  else if (expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE) {
    const salaryDataMonth = salaryData.month || 12
    let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
    if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
      ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
    }
    const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null].map(
      it =>
        it === null ? null : (it * salaryDataMonth / 10)
    )
    const suit = hasIntersection(theirSalaryInterval, ourSalaryInterval)
    return { suit, reason: suit ? null : 'no_intersection' }
  }
  return { suit: true, reason: null }
}

export function testIfJobTitleOrDescriptionSuit (jobInfo, config) {
  const {
    expectJobNameRegExpStr = '',
    expectJobTypeRegExpStr = '',
    expectJobDescRegExpStr = '',
    jobDetailRegExpMatchLogic
  } = config
  
  let isJobNameSuit = jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobNameRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobNameRegExpStr, 'im')
      isJobNameSuit = regExp.test(jobInfo.jobName?.replace(/\n/g, '') ?? '')
    }
  } catch {}
  
  let isJobTypeSuit = jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobTypeRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobTypeRegExpStr, 'im')
      isJobTypeSuit = regExp.test(jobInfo.positionName?.replace(/\n/g, '') ?? '')
    }
  } catch {}
  
  let isJobDescSuit = jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobDescRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobDescRegExpStr, 'im')
      isJobDescSuit = regExp.test(jobInfo.postDescription?.replace(/\n/g, '') ?? '')
    }
  } catch {}
  
  if (jobDetailRegExpMatchLogic === JobDetailRegExpMatchLogic.SOME) {
    return isJobNameSuit || isJobTypeSuit || isJobDescSuit
  }
  else {
    return isJobNameSuit && isJobTypeSuit && isJobDescSuit
  }
}

export function testIfJobDescriptionContainsTechStack (jobInfo, config) {
  const {
    searchSourceTechStackRegExpStr = ''
  } = config

  if (!searchSourceTechStackRegExpStr?.trim()) {
    return true
  }

  try {
    const regExp = new RegExp(searchSourceTechStackRegExpStr, 'im')
    return regExp.test(jobInfo?.postDescription?.replace(/\n/g, '') ?? '')
  } catch {
    return true
  }
}

// ─── Main Evaluation Entry Point ──────────────────────────────────────────────

export function evaluateJobEligibility (jobData, config, context = {}) {
  const {
    expectCityList,
    expectCityNotMatchStrategy,
    
    expectSalaryNotMatchStrategy,
    
    expectWorkExpList,
    expectWorkExpNotMatchStrategy,
    
    jobNotMatchStrategy,
    
    blockCompanyNameRegExp,
    blockCompanyNameRegMatchStrategy,
    
    markAsNotActiveSelectedTimeRange,
    jobNotActiveStrategy,

    combinedMatching,
    searchSourceRequireTechStack,
    searchSourceTechStackRegExpStr
  } = config
  
  const {
    selectedJobData,
    currentSourceType
  } = context
  
  const result = createEvaluationResult()
  const reasons = []
  const signals = {}
  const strategyMap = {}
  
  if (!!blockCompanyNameRegExp && blockCompanyNameRegExp.test(selectedJobData?.brandName ?? jobData?.brandName ?? '')) {
    reasons.push(EvaluationRejectReason.COMPANY_NAME_BLOCKED)
    signals.companyNameBlocked = true
    strategyMap.companyName = blockCompanyNameRegMatchStrategy
  }
  
  const bossActiveTimeDesc = jobData?.bossInfo?.activeTimeDesc
  const indexOfActiveText = activeDescList.indexOf(bossActiveTimeDesc)
  if (
    markAsNotActiveSelectedTimeRange > 0 &&
    indexOfActiveText > 0 && indexOfActiveText <= markAsNotActiveSelectedTimeRange
  ) {
    reasons.push(EvaluationRejectReason.BOSS_INACTIVE)
    signals.bossInactive = {
      activeTimeDesc: bossActiveTimeDesc,
      activeIndex: indexOfActiveText
    }
    strategyMap.active = jobNotActiveStrategy
  }
  
  const cityName = selectedJobData?.cityName ?? jobData?.cityName
  if (
    (Array.isArray(expectCityList) && expectCityList.length) && 
    !expectCityList.includes(cityName)
  ) {
    reasons.push(EvaluationRejectReason.CITY_NOT_MATCH)
    signals.cityNotMatch = { cityName }
    strategyMap.city = expectCityNotMatchStrategy
  }
  
  const jobExperience = selectedJobData?.jobExperience ?? jobData?.jobExperience
  if (
    (Array.isArray(expectWorkExpList) && expectWorkExpList.length) && 
    !expectWorkExpList.includes(jobExperience)
  ) {
    reasons.push(EvaluationRejectReason.WORK_EXP_NOT_MATCH)
    signals.workExpNotMatch = { jobExperience }
    strategyMap.workExp = expectWorkExpNotMatchStrategy
  }
  
  // ── Matching: regex + combined ──
  const jobInfo = jobData?.jobInfo ?? jobData
  const regexResult = testIfJobTitleOrDescriptionSuit(jobInfo, config)
  const requiresTechStackInSearch = (
    currentSourceType === 'search'
    && searchSourceRequireTechStack === true
    && Boolean(searchSourceTechStackRegExpStr?.trim())
  )
  const techStackMatched = requiresTechStackInSearch
    ? testIfJobDescriptionContainsTechStack(jobInfo, config)
    : true

  const isCombinedMatchingEnabled = combinedMatching?.enabled === true

  if (!techStackMatched) {
    reasons.push(EvaluationRejectReason.TECH_STACK_NOT_MATCH)
    signals.techStackNotMatch = true
    strategyMap.jobDetail = jobNotMatchStrategy
  }
  
  if (isCombinedMatchingEnabled && techStackMatched) {
    // Combined matching mode: regex is one scoring signal, not the sole gate
    const combinedResult = computeCombinedMatchScore(jobInfo, combinedMatching, regexResult)
    const scoreThreshold = combinedMatching.scoreThreshold ?? 1

    signals.combinedMatching = {
      score: combinedResult.score,
      threshold: scoreThreshold,
      ...combinedResult.signals
    }

    // Exclusion keyword is a hard reject
    if (combinedResult.exclusionHit) {
      reasons.push(EvaluationRejectReason.EXCLUSION_KEYWORD_HIT)
      signals.exclusionKeywordHit = combinedResult.exclusionDetail
      strategyMap.jobDetail = jobNotMatchStrategy
    }
    // Score below threshold
    else if (combinedResult.score < scoreThreshold) {
      reasons.push(EvaluationRejectReason.COMBINED_SCORE_BELOW_THRESHOLD)
      signals.combinedScoreBelowThreshold = {
        score: combinedResult.score,
        threshold: scoreThreshold
      }
      strategyMap.jobDetail = jobNotMatchStrategy
    }
    // Combined matching passed - also store score
    result.matchScore = combinedResult.score
  } else if (techStackMatched) {
    // Legacy regex-only mode
    if (!regexResult) {
      reasons.push(EvaluationRejectReason.JOB_DETAIL_NOT_MATCH)
      signals.jobDetailNotMatch = true
      strategyMap.jobDetail = jobNotMatchStrategy
    }
  }
  
  const salaryDesc = selectedJobData?.salaryDesc ?? jobData?.salaryDesc
  const salaryCheckResult = checkIfSalarySuit(salaryDesc, config)
  if (!salaryCheckResult.suit) {
    reasons.push(EvaluationRejectReason.SALARY_NOT_MATCH)
    signals.salaryNotMatch = { salaryDesc, reason: salaryCheckResult.reason }
    strategyMap.salary = expectSalaryNotMatchStrategy
  }
  
  result.reasons = reasons
  result.eligible = reasons.length === 0
  result.signals = signals
  result.strategyMap = strategyMap
  
  const hasMarkOnBoss = Object.values(strategyMap).includes(MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS)
  const hasMarkOnLocal = Object.values(strategyMap).includes(MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL)
  result.hardReject = hasMarkOnBoss || hasMarkOnLocal
  
  return result
}

// ─── List-Stage Pre-filter ────────────────────────────────────────────────────

export function evaluateJobForListSkip (jobListItem, config) {
  const {
    expectCityList,
    expectCityNotMatchStrategy,
    strategyScopeOptionWhenMarkJobCityNotMatch,
    
    expectWorkExpList,
    expectWorkExpNotMatchStrategy,
    strategyScopeOptionWhenMarkJobWorkExpNotMatch,
    
    expectSalaryLow,
    expectSalaryHigh,
    expectSalaryNotMatchStrategy,
    strategyScopeOptionWhenMarkSalaryNotMatch,
    
    blockCompanyNameRegExp,
    blockCompanyNameRegMatchStrategy,

    cityMode
  } = config
  
  const skipInfo = {
    shouldSkip: false,
    reason: null,
    shouldEnterDetail: false
  }

  // ── Strict city pre-filter: hard-block non-target-city jobs at list stage ──
  if (
    cityMode === 'strict' &&
    Array.isArray(expectCityList) &&
    expectCityList.length &&
    !expectCityList.includes(jobListItem.cityName)
  ) {
    skipInfo.shouldSkip = true
    skipInfo.reason = 'strict_city_not_match'
    return skipInfo
  }
  
  if (
    expectCityNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
    Array.isArray(expectCityList) &&
    expectCityList.length &&
    !expectCityList.includes(jobListItem.cityName)
  ) {
    skipInfo.shouldSkip = true
    skipInfo.reason = 'city_not_match_no_op'
    return skipInfo
  }
  
  if (
    [
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
    ].includes(expectCityNotMatchStrategy) &&
    strategyScopeOptionWhenMarkJobCityNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB &&
    Array.isArray(expectCityList) &&
    expectCityList.length &&
    !expectCityList.includes(jobListItem.cityName)
  ) {
    skipInfo.shouldEnterDetail = true
    skipInfo.reason = 'city_not_match_need_mark'
    return skipInfo
  }
  
  if (
    expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
    Array.isArray(expectWorkExpList) &&
    expectWorkExpList.length &&
    !expectWorkExpList.includes(jobListItem.jobExperience)
  ) {
    skipInfo.shouldSkip = true
    skipInfo.reason = 'work_exp_not_match_no_op'
    return skipInfo
  }
  
  if (
    [
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
    ].includes(expectWorkExpNotMatchStrategy) &&
    strategyScopeOptionWhenMarkJobWorkExpNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB &&
    Array.isArray(expectWorkExpList) &&
    expectWorkExpList.length &&
    !expectWorkExpList.includes(jobListItem.jobExperience)
  ) {
    skipInfo.shouldEnterDetail = true
    skipInfo.reason = 'work_exp_not_match_need_mark'
    return skipInfo
  }
  
  const isSalaryFilterEnabled = expectSalaryLow || expectSalaryHigh
  if (
    expectSalaryNotMatchStrategy === MarkAsNotSuitOp.NO_OP &&
    isSalaryFilterEnabled
  ) {
    const salaryCheckResult = checkIfSalarySuit(jobListItem.salaryDesc, config)
    if (!salaryCheckResult.suit) {
      skipInfo.shouldSkip = true
      skipInfo.reason = 'salary_not_match_no_op'
      return skipInfo
    }
  }
  
  if (
    [
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
    ].includes(expectSalaryNotMatchStrategy) &&
    strategyScopeOptionWhenMarkSalaryNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB &&
    isSalaryFilterEnabled
  ) {
    const salaryCheckResult = checkIfSalarySuit(jobListItem.salaryDesc, config)
    if (!salaryCheckResult.suit) {
      skipInfo.shouldEnterDetail = true
      skipInfo.reason = 'salary_not_match_need_mark'
      return skipInfo
    }
  }
  
  if (
    !!blockCompanyNameRegExp &&
    blockCompanyNameRegExp.test(jobListItem.brandName?.toLowerCase?.() ?? '') &&
    [
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
      MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
    ].includes(blockCompanyNameRegMatchStrategy)
  ) {
    skipInfo.shouldEnterDetail = true
    skipInfo.reason = 'company_name_blocked_need_mark'
    return skipInfo
  }
  
  return skipInfo
}
