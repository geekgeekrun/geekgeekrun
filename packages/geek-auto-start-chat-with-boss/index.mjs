import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'

import fs from 'node:fs'
import os from 'node:os'
import { get__dirname } from '@geekgeekrun/utils/legacy-path.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'
import JSON5 from 'json5'
import { EventEmitter } from 'node:events'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'

import { readConfigFile, writeStorageFile, ensureConfigFileExist, readStorageFile, ensureStorageFileExist } from './runtime-file-utils.mjs'
import {
  calculateTotalCombinations,
  combineFiltersWithConstraintsGenerator,
  checkAnyCombineBossRecommendFilterHasCondition,
  formatStaticCombineFilters,
} from './combineCalculator.mjs'
import { default as jobFilterConditions } from './internal-config/job-filter-conditions-20241002.json' with { type: 'json' }
import { default as rawIndustryFilterExemption } from './internal-config/job-filter-industry-filter-exemption-20241002.json' with { type: 'json' }
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog.js'
import {
  MarkAsNotSuitReason,
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch,
  JobDetailRegExpMatchLogic,
  JobSource,
  CombineRecommendJobFilterType
} from '@geekgeekrun/sqlite-plugin/dist/enums.js'
import {
  activeDescList,
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
  SEARCH_BOX_SELECTOR,
} from './constant.mjs'
import { waitForSageTimeOrJustContinue } from './sage-time.mjs'
import cityGroupData from './cityGroup.mjs'
import {
  createEvaluationConfig,
  evaluateJobEligibility,
  evaluateJobForListSkip
} from './evaluation.mjs'
import { createRuntimeProtectionManager } from './runtime-protection.mjs'
const puppeteerUserDataDir = (() => {
  const rawValue = process.env.GGR_PUPPETEER_USER_DATA_DIR
  if (!rawValue || typeof rawValue !== 'string') {
    return ''
  }
  return rawValue.trim()
})()
const flattedCityList = []
  ; (cityGroupData?.zpData?.cityGroup ?? []).forEach(it => {
    const firstChar = it.firstChar
    it.cityList.forEach(city => {
      flattedCityList.push({
        ...city,
        firstChar
      })
    })
  })

const jobFilterConditionsMapByCode = {}
Object.values(jobFilterConditions).forEach(arr => {
  arr.forEach(option => {
    jobFilterConditionsMapByCode[option.code] = option
  })
})

function stringifyErrorWithCause(err) {
  const queue = [err]
  const fragments = []
  while (queue.length) {
    const currentErr = queue.shift()
    if (!currentErr) {
      continue
    }
    if (currentErr instanceof Error) {
      if (currentErr.message) {
        fragments.push(currentErr.message)
      }
      if (currentErr.stack) {
        fragments.push(currentErr.stack)
      }
      if (currentErr.cause) {
        queue.push(currentErr.cause)
      }
      continue
    }
    if (typeof currentErr === 'object' && currentErr.cause) {
      queue.push(currentErr.cause)
    }
    fragments.push(String(currentErr))
  }
  return fragments.join('\n')
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeKeywordTokens(keyword) {
  return String(keyword ?? '')
    .toLowerCase()
    .split(/[\s/|,_-]+/)
    .map(token => token.trim())
    .filter(Boolean)
}

function checkIfSearchKeywordMatchesJob(jobData, keyword) {
  const rawKeyword = String(keyword ?? '').trim()
  if (!rawKeyword) {
    return true
  }

  const haystack = [
    jobData?.jobName,
    jobData?.positionName,
    jobData?.postDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!haystack) {
    return false
  }

  const exactKeywordRegExp = new RegExp(escapeRegExp(rawKeyword), 'i')
  if (exactKeywordRegExp.test(haystack)) {
    return true
  }

  const keywordTokens = normalizeKeywordTokens(rawKeyword)
  if (keywordTokens.length > 1) {
    return keywordTokens.every(token => haystack.includes(token))
  }

  return haystack.includes(rawKeyword.toLowerCase())
}

function detectSearchKeywordDrift(jobListData, keyword) {
  const candidateList = Array.isArray(jobListData) ? jobListData.slice(0, 5) : []
  if (!keyword || candidateList.length < 5) {
    return {
      drifted: false,
      checkedCount: candidateList.length,
      matchedCount: 0
    }
  }

  const matchedCount = candidateList.filter(jobData => checkIfSearchKeywordMatchesJob(jobData, keyword)).length
  return {
    drifted: matchedCount === 0,
    checkedCount: candidateList.length,
    matchedCount
  }
}

async function getChatConfirmDiagnostics(page) {
  try {
    return await page.evaluate(() => {
      const dialog = document.querySelector('.chat-block-dialog')
      const footer = dialog?.querySelector('.chat-block-footer')
      const buttonTexts = Array.from(
        footer?.querySelectorAll('button, .zp-btn, [role="button"], .sure-btn, .cancel-btn') ?? []
      )
        .map(node => node?.textContent?.trim?.() ?? '')
        .filter(Boolean)

      return {
        currentUrl: window.location.href,
        dialogText: dialog?.textContent?.replace(/\s+/g, ' ')?.trim?.() ?? '',
        buttonTexts,
        hasDialog: Boolean(dialog),
        hasFooter: Boolean(footer)
      }
    })
  } catch (err) {
    return {
      readFailed: true,
      error: stringifyErrorWithCause(err)
    }
  }
}

async function findContinueConfirmButton(page) {
  const candidateSelectors = [
    '.chat-block-dialog .chat-block-footer .sure-btn',
    '.chat-block-dialog .chat-block-footer button',
    '.chat-block-dialog .chat-block-footer .zp-btn',
    '.chat-block-dialog button',
    '.chat-block-dialog .zp-btn',
  ]

  for (const selector of candidateSelectors) {
    const buttons = await page.$$(selector)
    for (const button of buttons) {
      try {
        const buttonMeta = await button.evaluate((node) => {
          const text = node?.textContent?.replace(/\s+/g, ' ')?.trim?.() ?? ''
          const className = typeof node?.className === 'string' ? node.className : ''
          return {
            text,
            className,
            disabled: 'disabled' in node ? Boolean(node.disabled) : false,
          }
        })
        if (buttonMeta.disabled) {
          continue
        }
        if (
          buttonMeta.text.includes('继续')
          || buttonMeta.text.includes('确认')
          || buttonMeta.className.includes('sure-btn')
        ) {
          return button
        }
      } catch {
        continue
      }
    }
  }

  return null
}

function isIgnorablePageLifecycleError(err) {
  const message = stringifyErrorWithCause(err)
  return [
    'Execution context was destroyed',
    'Cannot find context with specified id',
    'Session closed',
    'TargetCloseError',
    'Most likely the page has been closed',
    'Node with given id does not belong to the document',
    'Attempted to use detached Frame',
    'detached Frame',
    'Runtime.callFunctionOn timed out',
  ].some(fragment => message.includes(fragment))
}

function isSecurityCheckUrl(url) {
  return /[_?&]security_check=1/.test(url)
    || /[?&]_security_check=1/.test(url)
    || /\/web\/passport\/zp\/security\.html/.test(url)
}

function buildSecurityCheckError(url, tag) {
  const tagText = tag ? ` (${tag})` : ''
  return new Error(`SECURITY_CHECK_TRIGGERED${tagText}: ${url}`)
}

function throwIfSecurityCheckTriggered(tag) {
  const currentUrl = page?.url?.() ?? ''
  if (!isSecurityCheckUrl(currentUrl)) {
    return
  }
  throw buildSecurityCheckError(currentUrl, tag)
}

const loginEntryUrl = 'https://www.zhipin.com/web/user/?ka=header-login'

async function getLoginStatusSnapshot() {
  if (!page || page.isClosed()) {
    return {
      apiResult: null,
      isLoggedIn: false,
      hasAnonymousUiHint: false,
      currentUrl: ''
    }
  }

  const [apiResult, bodyText] = await Promise.all([
    page
      .evaluate(async () => {
        try {
          const response = await fetch('/wapi/zpuser/wap/getUserInfo.json', {
            credentials: 'include'
          })
          return await response.json()
        } catch (err) {
          return {
            code: -1,
            message: String(err)
          }
        }
      })
      .catch(() => ({ code: -1 })),
    page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  ])

  const hasAnonymousUiHint = /登录\/注册|登录账号，查看更多好职位|立即登录/.test(bodyText)
  return {
    apiResult,
    isLoggedIn: apiResult?.code === 0,
    hasAnonymousUiHint,
    currentUrl: page.url()
  }
}

function isPuppeteerTimeoutError(err) {
  if (!(err instanceof Error)) {
    return false
  }
  return err.name === 'TimeoutError'
    || err.message.includes('Timed out after waiting')
    || err.message.includes('Waiting failed')
}

async function safeEvaluatePage(run, {
  defaultValue = null,
  label = 'page.evaluate'
} = {}) {
  try {
    if (!page || page.isClosed()) {
      return defaultValue
    }
    const result = await run()
    return result ?? defaultValue
  } catch (err) {
    if (isIgnorablePageLifecycleError(err)) {
      console.warn(`[${label}] ${stringifyErrorWithCause(err)}`)
      return defaultValue
    }
    throw err
  }
}

async function getRecommendJobDetailSnapshot() {
  return await safeEvaluatePage(
    () => page.evaluate(() => {
      const detailVm = document.querySelector('.job-detail-box')?.__vue__
      const pageJobsVm = document.querySelector('.page-jobs-main')?.__vue__
      return {
        targetJobData: detailVm?.data ?? null,
        selectedJobData: pageJobsVm?.currentJob ?? null,
        hasDetailVm: !!detailVm,
        hasPageJobsVm: !!pageJobsVm
      }
    }),
    {
      defaultValue: {
        targetJobData: null,
        selectedJobData: null,
        hasDetailVm: false,
        hasPageJobsVm: false
      },
      label: 'recommendJobDetailSnapshot'
    }
  )
}

async function getPageDebugSnapshot() {
  if (!page || page.isClosed()) {
    return {
      url: '',
      title: '',
      readyState: 'closed',
      hasPageMain: false,
      hasJobList: false,
      hasJobDetail: false,
      hasLoginHint: false,
      hasSecurityText: false,
      textSnippet: ''
    }
  }

  const [title, snapshot] = await Promise.all([
    page.title().catch(() => ''),
    safeEvaluatePage(
      () => page.evaluate(() => {
        const text = document.body?.innerText ?? ''
        return {
          readyState: document.readyState,
          hasPageMain: !!document.querySelector('.page-jobs-main'),
          hasJobList: !!document.querySelector('ul.rec-job-list'),
          hasJobDetail: !!document.querySelector('.job-detail-box'),
          hasLoginHint: /登录\/注册|登录账号，查看更多好职位|立即登录/.test(text),
          hasSecurityText: /安全验证|验证通过后继续访问|请完成验证|security/i.test(text),
          textSnippet: text.replace(/\s+/g, ' ').trim().slice(0, 240)
        }
      }),
      {
        defaultValue: {
          readyState: 'unknown',
          hasPageMain: false,
          hasJobList: false,
          hasJobDetail: false,
          hasLoginHint: false,
          hasSecurityText: false,
          textSnippet: ''
        },
        label: 'pageDebugSnapshot'
      }
    )
  ])

  return {
    url: page.url(),
    title,
    ...snapshot
  }
}

async function waitForPageConditionWithRecovery(run, {
  tag,
  timeoutContext = 'page condition',
  allowRetryWithoutSecurity = false,
  retryDelayMs = 3000,
  maxRetryCount = 3,
} = {}) {
  let retryCount = 0
  while (true) {
    try {
      return await run()
    } catch (err) {
      if (!isPuppeteerTimeoutError(err) && !isIgnorablePageLifecycleError(err)) {
        throw err
      }

      const currentUrl = page?.url?.() ?? ''
      if (isSecurityCheckUrl(currentUrl)) {
        await waitForManualSecurityRecovery({
          tag: tag ?? timeoutContext
        })
        retryCount = 0
        continue
      }

      if (
        allowRetryWithoutSecurity
        && retryCount < maxRetryCount
        && (
          currentUrl.startsWith(recommendJobPageUrl)
          || currentUrl.startsWith(loginEntryUrl)
        )
      ) {
        retryCount++
        const errorKind = isIgnorablePageLifecycleError(err) ? 'Lifecycle changed' : 'Timeout'
        const debugSnapshot = await getPageDebugSnapshot()
        console.warn(`[${timeoutContext}] ${errorKind} on ${currentUrl}, retry ${retryCount}/${maxRetryCount}.`)
        console.warn(
          `[${timeoutContext}] Snapshot: ${JSON.stringify(debugSnapshot)}`
        )
        await sleep(retryDelayMs)
        continue
      }

      throw err
    }
  }
}

async function waitForManualLoginRecovery({
  tag,
  checkIntervalMs = 3000
} = {}) {
  const tagText = tag ? ` (${tag})` : ''
  console.warn(`[SecurityCheck${tagText}] Redirecting to login entry to trigger verification or manual re-login.`)
  await page.goto(loginEntryUrl, { waitUntil: 'domcontentloaded' }).catch(() => void 0)

  while (true) {
    if (!page || page.isClosed()) {
      throw new Error(`SECURITY_CHECK_RECOVERY_PAGE_CLOSED${tagText}`)
    }

    const { isLoggedIn, hasAnonymousUiHint, currentUrl } = await getLoginStatusSnapshot()
    if (
      isLoggedIn &&
      !hasAnonymousUiHint &&
      !isSecurityCheckUrl(currentUrl)
    ) {
      if (!currentUrl.startsWith(recommendJobPageUrl)) {
        await page.goto(recommendJobPageUrl, { waitUntil: 'domcontentloaded' }).catch(() => void 0)
      }
      await page.waitForFunction(() => {
        return document.readyState === 'complete'
      }, { timeout: 10 * 1000 }).catch(() => void 0)
      console.log(`[SecurityCheck${tagText}] Manual login recovery is completed, resuming from ${page.url()}.`)
      await storeStorage(page).catch(() => void 0)
      return
    }

    await sleep(checkIntervalMs)
  }
}

async function hasInteractiveSecurityVerification() {
  if (!page || page.isClosed()) {
    return false
  }

  const currentUrl = page.url()
  if (/[?&]_security_check=1/.test(currentUrl) || /[_?&]security_check=1/.test(currentUrl)) {
    return false
  }

  return await page.evaluate(() => {
    const text = document.body?.innerText ?? ''
    if (/滑动|验证|验证码|短信验证|手机验证|请完成验证/.test(text)) {
      return true
    }
    return Boolean(
      document.querySelector('iframe[src*="captcha"]')
      || document.querySelector('[class*="captcha"]')
      || document.querySelector('[id*="captcha"]')
      || document.querySelector('input[type="tel"]')
      || document.querySelector('input[placeholder*="验证码"]')
    )
  }).catch(() => false)
}

export async function waitForManualSecurityRecovery({
  tag,
  checkIntervalMs = 3000,
  autoRedirectToLoginDelayMs = 5000,
} = {}) {
  const tagText = tag ? ` (${tag})` : ''
  console.warn(`[SecurityCheck${tagText}] Security page is detected. Browser will stay open until manual recovery is completed.`)
  const startedAt = Date.now()
  let hasRedirectedToLogin = false
  while (true) {
    if (!page || page.isClosed()) {
      throw new Error(`SECURITY_CHECK_RECOVERY_PAGE_CLOSED${tagText}`)
    }
    const currentUrl = page.url()
    if (
      isSecurityCheckUrl(currentUrl)
      && !hasRedirectedToLogin
      && Date.now() - startedAt >= autoRedirectToLoginDelayMs
    ) {
      const hasInteractiveVerification = await hasInteractiveSecurityVerification()
      if (!hasInteractiveVerification) {
        hasRedirectedToLogin = true
        await waitForManualLoginRecovery({
          tag: `${tag ?? 'security'} -> login`,
          checkIntervalMs
        })
        return
      }
    }
    if (!isSecurityCheckUrl(currentUrl)) {
      await page.waitForFunction(() => {
        return document.readyState === 'complete'
      }, { timeout: 10 * 1000 }).catch(() => void 0)
      console.log(`[SecurityCheck${tagText}] Manual recovery is completed, resuming from ${page.url()}.`)
      await storeStorage(page).catch(() => void 0)
      return
    }
    await sleep(checkIntervalMs)
  }
}

async function waitForRecommendPageReady() {
  await page.waitForFunction(
    (
      recommendJobPageUrl,
      userSetExpectJobEntriesSelector,
      recommendJobEntrySelector,
    ) => {
      if (
        !location.href.startsWith(recommendJobPageUrl)
        || document.readyState !== 'complete'
        || /[_?&]security_check=1/.test(location.href)
        || /[?&]_security_check=1/.test(location.href)
      ) {
        return false
      }
      const hasJobSourceEntry = Boolean(
        document.querySelector(userSetExpectJobEntriesSelector)
        || document.querySelector(recommendJobEntrySelector)
      )
      const hasRecommendState = Boolean(
        document.querySelector('.job-list-container .rec-job-list')
        || document.querySelector('.recommend-result-job .job-empty-wrapper')
      )
      return hasJobSourceEntry && hasRecommendState
    },
    {
      timeout: 30 * 1000,
      polling: 250,
    },
    recommendJobPageUrl,
    USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
    RECOMMEND_JOB_ENTRY_SELECTOR,
  )
}

let industryFilterCursorIndex = 0;
const industryFilterExemption = JSON.parse(JSON.stringify(rawIndustryFilterExemption))
const industryFilterConditionsMapByIndex = {}
const industryFilterConditionsMapByCode = {}
const industryFilterConditionCodeToIndexMap = {}
industryFilterExemption.forEach(item => {
  if (!Array.isArray(item.subLevelModelList)) {
    return
  }
  item.subLevelModelList.forEach(option => {
    industryFilterConditionsMapByCode[option.code] = option
    industryFilterConditionsMapByIndex[industryFilterCursorIndex] = option
    industryFilterConditionCodeToIndexMap[option.code] = industryFilterCursorIndex
    industryFilterCursorIndex++
  })
})

ensureConfigFileExist()
ensureStorageFileExist()

const isUiDev = process.env.NODE_ENV === 'development'
export const autoStartChatEventBus = new EventEmitter()

/**
 * @type { import("puppeteer") }
 */
let puppeteer
let StealthPlugin
let LaodengPlugin
let AnonymizeUaPlugin
export async function initPuppeteer() {
  // production
  const importResult = await Promise.all(
    [
      import('puppeteer-extra'),
      import('puppeteer-extra-plugin-stealth'),
      import('@geekgeekrun/puppeteer-extra-plugin-laodeng'),
      import('puppeteer-extra-plugin-anonymize-ua')
    ]
  )
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  LaodengPlugin = importResult[2].default
  AnonymizeUaPlugin = importResult[3].default
  puppeteer.use(StealthPlugin())
  puppeteer.use(LaodengPlugin())
  puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }))
  return {
    puppeteer,
    StealthPlugin,
    LaodengPlugin,
    AnonymizeUaPlugin
  }
}

const commonJobConditionConfig = readConfigFile('common-job-condition-config.json')
const fieldsForUseCommonConfig = readConfigFile('boss.json').fieldsForUseCommonConfig ?? {}

const targetCompanyList = (
  !fieldsForUseCommonConfig.expectCompanies ?
    readConfigFile('target-company-list.json')
    :
    commonJobConditionConfig.expectCompanies
).filter(it => !!it.trim());
const combineRecommendJobFilterType = readConfigFile('boss.json').combineRecommendJobFilterType ?? CombineRecommendJobFilterType.ANY_COMBINE

const anyCombineRecommendJobFilter = readConfigFile('boss.json').anyCombineRecommendJobFilter
const staticCombineRecommendJobFilterConditions = readConfigFile('boss.json').staticCombineRecommendJobFilterConditions ?? []
let isSkipEmptyConditionForCombineRecommendJobFilter = readConfigFile('boss.json').isSkipEmptyConditionForCombineRecommendJobFilter
if (!checkAnyCombineBossRecommendFilterHasCondition(anyCombineRecommendJobFilter)) {
  isSkipEmptyConditionForCombineRecommendJobFilter = false
}
const expectJobRegExpStr = readConfigFile('boss.json').expectJobRegExpStr
const jobNotMatchStrategy = readConfigFile('boss.json').jobNotMatchStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS

const expectCityNotMatchStrategy = readConfigFile('boss.json').expectCityNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const expectCityList = (
  !fieldsForUseCommonConfig.city ?
    readConfigFile('boss.json').expectCityList
    :
    commonJobConditionConfig.expectCityList
) ?? []

const strategyScopeOptionWhenMarkJobCityNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobCityNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// salary
const expectSalaryLow = parseFloat(
  !fieldsForUseCommonConfig.salary ?
    readConfigFile('boss.json').expectSalaryLow
    :
    commonJobConditionConfig.expectSalaryLow
) || null
const expectSalaryHigh = parseFloat(
  !fieldsForUseCommonConfig.salary ?
    readConfigFile('boss.json').expectSalaryHigh
    :
    commonJobConditionConfig.expectSalaryHigh
) || null
const expectSalaryCalculateWay = (
  !fieldsForUseCommonConfig.salary ?
    readConfigFile('boss.json').expectSalaryCalculateWay
    :
    commonJobConditionConfig.expectSalaryCalculateWay
) ?? SalaryCalculateWay.MONTH_SALARY
const expectSalaryNotMatchStrategy = readConfigFile('boss.json').expectSalaryNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const isSalaryFilterEnabled = expectSalaryLow || expectSalaryHigh
const strategyScopeOptionWhenMarkSalaryNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkSalaryNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// work exp
let expectWorkExpList = readConfigFile('boss.json').expectWorkExpList ?? []
const expectWorkExpListSet = new Set(expectWorkExpList)
if (
  expectWorkExpListSet.has('不限')
  || expectWorkExpListSet.has('经验不限')
) {
  expectWorkExpListSet.delete('不限')
  expectWorkExpListSet.delete('经验不限')
  expectWorkExpListSet.add('经验不限')
}
if (expectWorkExpListSet.has('1年以下')) {
  expectWorkExpListSet.delete('1年以下')
  expectWorkExpListSet.add('1年以内')
}
if (
  expectWorkExpListSet.has('应届生') ||
  expectWorkExpListSet.has('在校生') ||
  expectWorkExpListSet.has('在校/应届')
) {
  expectWorkExpListSet.delete('应届生')
  expectWorkExpListSet.delete('在校生')
  expectWorkExpListSet.add('在校/应届')
}
expectWorkExpList = Array.from(expectWorkExpListSet)

const expectWorkExpNotMatchStrategy = readConfigFile('boss.json').expectWorkExpNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const strategyScopeOptionWhenMarkJobWorkExpNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobWorkExpNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

let jobDetailRegExpMatchLogic = (
  !fieldsForUseCommonConfig.jobDetail ?
    readConfigFile('boss.json').jobDetailRegExpMatchLogic
    :
    commonJobConditionConfig.jobDetailRegExpMatchLogic
) ?? JobDetailRegExpMatchLogic.EVERY

const markAsNotActiveSelectedTimeRange = (() => {
  let n = readConfigFile('boss.json').markAsNotActiveSelectedTimeRange
  if (
    typeof n !== 'number' || isNaN(parseInt(n)) || n >= activeDescList.length || n < 0
  ) {
    n = 7
  }
  return n
})()
const jobNotActiveStrategy = (() => {
  let value = readConfigFile('boss.json').jobNotActiveStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
  if (markAsNotActiveSelectedTimeRange === 0) {
    value = MarkAsNotSuitOp.NO_OP
  }
  return value
})()

let {
  expectJobNameRegExpStr,
  expectJobTypeRegExpStr,
  expectJobDescRegExpStr,
} = !fieldsForUseCommonConfig.jobDetail ? readConfigFile('boss.json') : commonJobConditionConfig
if (
  !fieldsForUseCommonConfig.jobDetail &&
  expectJobRegExpStr &&
  !expectJobNameRegExpStr &&
  !expectJobTypeRegExpStr &&
  !expectJobDescRegExpStr
) {
  expectJobNameRegExpStr = expectJobRegExpStr
  expectJobTypeRegExpStr = expectJobRegExpStr
  expectJobDescRegExpStr = expectJobRegExpStr
}

if (
  [
    expectJobNameRegExpStr,
    expectJobTypeRegExpStr,
    expectJobDescRegExpStr,
  ].map(it => Boolean(it?.trim())).every(it => !it)
) {
  jobDetailRegExpMatchLogic = JobDetailRegExpMatchLogic.EVERY
}

let {
  jobSourceList
} = readConfigFile('boss.json')
const normalizedJobSource = []
const addedSourceSet = new Set()
for (const source of (jobSourceList ?? [])) {
  if (addedSourceSet.has(source.type)) {
    continue
  }
  if (!source?.enabled) {
    continue
  }
  if (source.type === 'search') {
    for (const searchOption of (source.children ?? [])) {
      if (!searchOption.enabled || !searchOption.keyword?.trim()) {
        continue
      }
      const key = [
        source.type,
        searchOption.keyword.trim()
      ].join('__')
      if (addedSourceSet.has(key)) {
        continue
      }
      normalizedJobSource.push({
        type: 'search',
        keyword: searchOption.keyword.trim()
      })
      addedSourceSet.add(key)
    }
    addedSourceSet.add(source.type)
  }
  else {
    normalizedJobSource.push({
      type: source.type,
    })
    addedSourceSet.add(source.type)
  }
}
if (!normalizedJobSource?.length) {
  normalizedJobSource.push({
    type: 'expect'
  })
}
const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const recommendJobPageUrl = `https://www.zhipin.com/web/geek/jobs`

const expectCompanySet = new Set(targetCompanyList)
const enableCompanyAllowList = Boolean(expectCompanySet.size)
const blockCompanyNameRegExpStr = (
  !fieldsForUseCommonConfig.blockCompanyNameRegExpStr ?
    readConfigFile('boss.json').blockCompanyNameRegExpStr
    :
    commonJobConditionConfig.blockCompanyNameRegExpStr
) ?? ''
const blockCompanyNameRegExp = (() => {
  if (!blockCompanyNameRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(blockCompanyNameRegExpStr, 'im')
  }
  catch {
    return null
  }
})()
const blockCompanyNameRegMatchStrategy = readConfigFile('boss.json').blockCompanyNameRegMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const cityMode = readConfigFile('boss.json').cityMode ?? 'soft'
const reliabilityProtection = readConfigFile('boss.json').reliabilityProtection ?? {}
const combinedMatching = readConfigFile('boss.json').combinedMatching ?? null
const searchKeywordDegradation = readConfigFile('boss.json').searchKeywordDegradation ?? {}
const searchSourceRequireTechStack = readConfigFile('boss.json').searchSourceRequireTechStack === true
const searchSourceTechStackRegExpStr = readConfigFile('boss.json').searchSourceTechStackRegExpStr ?? ''
const isReliabilityProtectionEnabled = reliabilityProtection?.enabled === true
const isSearchKeywordDegradationEnabled = searchKeywordDegradation?.enabled === true
const runtimeEvaluationConfig = createEvaluationConfig({
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
})
const runtimeProtectionManager = createRuntimeProtectionManager({
  strictCityMode: cityMode === 'strict',
  targetCityList: expectCityList,
  unreliableThreshold: reliabilityProtection?.unreliableThreshold ?? 5,
  unreliableAction: reliabilityProtection?.actionOnThreshold ?? 'skipSource',
  keywordDegradationThreshold: searchKeywordDegradation?.degradationThreshold ?? 10,
  keywordDegradationAction: searchKeywordDegradation?.actionOnDegradation ?? 'skipKeyword'
})

function getExpectedWorkExpFilterCodes() {
  const workExpNameSet = new Set(expectWorkExpList)
  if (!workExpNameSet.size) {
    return []
  }

  const result = new Set()
  for (const option of jobFilterConditions.experienceList ?? []) {
    if (option.code === 0) {
      continue
    }
    if (workExpNameSet.has(option.name)) {
      result.add(option.code)
      continue
    }
    if (
      workExpNameSet.has('在校/应届')
      && (option.name === '在校生' || option.name === '应届生')
    ) {
      result.add(option.code)
      continue
    }
  }
  return Array.from(result)
}

function mergeRuntimeHardFilters(filterCondition) {
  const mergedFilterCondition = {
    ...(filterCondition ?? {})
  }

  if (Array.isArray(expectCityList) && expectCityList.length) {
    mergedFilterCondition.cityList = [...expectCityList]
  }

  const expectedWorkExpCodes = getExpectedWorkExpFilterCodes()
  if (expectedWorkExpCodes.length) {
    mergedFilterCondition.experienceList = expectedWorkExpCodes
  }

  return mergedFilterCondition
}

/**
 * @type { import('puppeteer').Browser }
 */
let browser
/**
 * @type { import('puppeteer').Page }
 */
let page

const blockBossNotNewChat = new Set()
const blockBossNotActive = new Set()
const blockJobNotSuit = new Set()

async function markJobAsNotSuitInRecommendPage(reasonCode) {
  /**
   * @type {{chosenReasonInUi?: { code: number, text: string}}}
   */
  const result = {}
  const notSuitableFeedbackButtonProxy = await page.$('.job-detail-box .job-detail-operate .not-suitable')
  if (notSuitableFeedbackButtonProxy) {
    await notSuitableFeedbackButtonProxy.evaluate(el => {
      el.scrollIntoView({
        block: 'center'
      })
    })
    await sleep(200)
    await notSuitableFeedbackButtonProxy.click()
    const rawReasonResData = (await (await page.waitForResponse(
      response => {
        if (
          response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json')
        ) {
          return true
        }
        return false
      }
    )).json())?.zpData?.result ?? [];
    const reasonCodeToTextMap = await readStorageFile('job-not-suit-reason-code-to-text-cache.json')
    for (const it of rawReasonResData) {
      reasonCodeToTextMap[it.code] = it.text?.content ?? ''
    }
    await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    await sleepWithRandomDelay(2000)
    const chooseReasonDialogProxy = await (async () => {
      const alls = await page.$$('.zp-dialog-wrap.zp-feedback-dialog')
      return alls?.[alls.length - 1]
    })()
    let isOptionChosen = false
    if (chooseReasonDialogProxy) {
      switch (reasonCode) {
        case MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.BOSS_INACTIVE: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title="BOSS活跃度低"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="职位停招/招满"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT:
        case MarkAsNotSuitReason.JOB_CITY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_NOT_SUIT:
        default: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="职位"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
      }

      if (isOptionChosen) {
        await sleepWithRandomDelay(1500)
        const confirmButtonProxy = await chooseReasonDialogProxy.$(`.zp-dialog-footer .zp-btn.zp-btn-sure`)
        await confirmButtonProxy.click()
        const response = await page.waitForResponse(
          response => {
            if (
              response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json')
            ) {
              return true
            }
            return false
          }
        )
        /**
         * scene=4&code=41&feedbackReason=&securityId=
         */
        const requestBody = response.request().postData()
        const chosenCode = Number(new URLSearchParams(requestBody).get('code'))
        if (chosenCode) {
          result.chosenReasonInUi = {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        }
      } else {
        const cancelButtonProxy = await chooseReasonDialogProxy.$(`.zp-close`)
        await cancelButtonProxy.click()
      }

      await sleepWithRandomDelay(2500)
    }
  }
  return result
}

export function testIfJobTitleOrDescriptionSuit(jobInfo, matchLogic) {
  let isJobNameSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobNameRegExpStr.trim()) {
      const regExp = new RegExp(expectJobNameRegExpStr, 'im')
      isJobNameSuit = regExp.test(jobInfo.jobName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobTypeSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobTypeRegExpStr.trim()) {
      const regExp = new RegExp(expectJobTypeRegExpStr, 'im')
      isJobTypeSuit = regExp.test(jobInfo.positionName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobDescSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobDescRegExpStr.trim()) {
      const regExp = new RegExp(expectJobDescRegExpStr, 'im')
      isJobDescSuit = regExp.test(jobInfo.postDescription?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  if (matchLogic === JobDetailRegExpMatchLogic.SOME) {
    return isJobNameSuit || isJobTypeSuit || isJobDescSuit
  }
  else {
    return isJobNameSuit && isJobTypeSuit && isJobDescSuit
  }
}

async function setFilterCondition(selectedFilters) {
  const {
    cityList = [],
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  const placeholderTexts = ['城市', '薪资待遇', '工作经验', '学历要求', '公司行业', '公司规模']
  const optionKaPrefixes = ['switch_city_dialog_open', 'sel-job-rec-salary-', 'sel-job-rec-exp-', 'sel-job-rec-degree-', 'sel-industry-', 'sel-job-rec-scale-']
  const conditionArr = [cityList, salaryList, experienceList, degreeList, industryList, scaleList]

  console.log('current filter condition----')
  for (let i = 0; i < placeholderTexts.length; i++) {
    const text = placeholderTexts[i]
    const condition = conditionArr[i]
    console.log(`${text}：`, condition.length === 0 ? '不限' : condition.map(code => {
      if (text === '公司行业') {
        return industryFilterConditionsMapByCode[code]?.name ?? code
      } else {
        return jobFilterConditionsMapByCode[code]?.name ?? code
      }
    }).join('，'))
  }
  console.log('----------------------------')
  for (let i = 0; i < placeholderTexts.length; i++) {
    const placeholderText = placeholderTexts[i]
    const filterDropdownProxy = await (async () => {
      const jsHandle = (await page.evaluateHandle((placeholderText) => {
        if (placeholderText === '城市') {
          return document.querySelector('.page-jobs-main .filter-condition-inner [ka="switch_city_dialog_open"]')
        }
        else {
          const filterBar = document.querySelector('.page-jobs-main .filter-condition-inner')
          const dropdownEntry = filterBar?.__vue__?.$children?.find(it => it.placeholder === placeholderText)
          return dropdownEntry?.$el
        }
      }, placeholderText))?.asElement();
      return jsHandle
    })()
    if (!filterDropdownProxy) {
      continue
    }

    const currentFilterConditions = conditionArr[i];
    const filterDropdownCssList = await filterDropdownProxy.evaluate(el => Array.from(el.classList));
    if (placeholderText === '城市') {
      const onPageSelectedCity = filterDropdownCssList.includes('active') ? (await filterDropdownProxy.evaluate(el => el.textContent.trim())) : null
      if (!onPageSelectedCity && !currentFilterConditions.length) {
        continue
      } else if (!currentFilterConditions.length) {
        await filterDropdownProxy?.click()
        await page.waitForFunction(() => {
          const dialogEl = document.querySelector('.city-select-dialog')
          return dialogEl && window.getComputedStyle(dialogEl).display !== 'none'
        })
        const cleared = await page.evaluate(() => {
          const textSet = ['全国', '不限', '清空', '重置']
          const isVisible = (el) => {
            if (!el) {
              return false
            }
            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
          }
          const candidates = [...document.querySelectorAll('.city-select-dialog *')].filter((el) => {
            const text = el.textContent?.trim()
            return textSet.includes(text) && isVisible(el)
          })
          const target = candidates[0]
          if (!target) {
            return false
          }
          target.click()
          return true
        })
        if (cleared) {
          await sleepWithRandomDelay(800)
          continue
        }
        continue
      } else if (onPageSelectedCity === (currentFilterConditions[0] ?? null)) {
        continue
      } else {
        if (currentFilterConditions.length) {
          await filterDropdownProxy?.click()
          await page.waitForFunction(() => {
            const dialogEl = document.querySelector('.city-select-dialog')
            return dialogEl && window.getComputedStyle(dialogEl).display !== 'none'
          })
          const citySelectWrapperProxy = await page.waitForSelector('.city-select-wrapper')
          let targetCityElJsHandle = (await page.evaluateHandle((cityName) => {
            const targetCityEl = [...document.querySelectorAll('.city-select-dialog .city-select-wrapper ul.city-list-hot li')].find(it => it.textContent.trim() === cityName) ?? null
            return targetCityEl
          }, currentFilterConditions[0]))?.asElement()
          if (!targetCityElJsHandle) {
            const targetCityItem = flattedCityList.find(it => it.name === currentFilterConditions[0])
            if (!targetCityItem) {
              // unexpected condition
              continue
            }
            const firstChar = targetCityItem.firstChar
            const targetCityCharListEntryHandle = await page.$(`xpath///*[contains(@class, "city-select-dialog")]//*[contains(@class, "city-select-wrapper")]//ul[contains(@class, "city-char-list")]//li[contains(text(), '${firstChar.toUpperCase()}')]`)
            await targetCityCharListEntryHandle.click()
            targetCityElJsHandle = (await page.evaluateHandle((cityName) => {
              const targetCityEl = [...document.querySelectorAll('.city-select-dialog .city-select-wrapper .list-select-list a')].find(it => it.textContent.trim() === cityName) ?? null
              return targetCityEl
            }, currentFilterConditions[0]))?.asElement()
          }
          if (!targetCityElJsHandle) {
            // unexpected condition
            continue
          }
          await targetCityElJsHandle.click()
          await sleep(1000)
        }
      }
    }
    else {
      if (!filterDropdownCssList.includes('is-select') && !currentFilterConditions.length) {
        continue
      } else {
        await filterDropdownProxy.scrollIntoView()
        const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
        await page.mouse.move(
          filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
          filterDropdownElBBox.y + filterDropdownElBBox.height / 2,
        )
        await sleepWithRandomDelay(500)

        const optionKaPrefix = optionKaPrefixes[i]
        if (!currentFilterConditions.length) {
          if (placeholderText === '公司行业') {
            const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
            for (const it of activeOptionElAtCurrentFilterProxyList) {
              await it.click()
            }
          } else {
            // select 不限 immediately
            const buxianOptionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${0}"]`)
            await buxianOptionElProxy.click()
          }
        } else {
          //#region uncheck options perviously checked but not existed in current filter.
          const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
          const activeOptionValues = (await Promise.all(
            activeOptionElAtCurrentFilterProxyList.map(elProxy => {
              return elProxy.evaluate((el) => {
                return el.getAttribute('ka')
              })
            })
          )).map(it => it.replace(optionKaPrefix, '')).map(Number)
          if (placeholderText !== '薪资待遇') {
            for (let i = 0; i < activeOptionValues.length; i++) {
              let activeValue
              if (placeholderText === '公司行业') {
                activeValue = industryFilterConditionsMapByIndex[activeOptionValues[i]]?.code
              } else {
                activeValue = activeOptionValues[i]
              }
              const activeOptionElProxy = activeOptionElAtCurrentFilterProxyList[i]
              if (!currentFilterConditions.includes(activeValue)) {
                await activeOptionElProxy.click()
              }
            }
          }
          //#endregion
          //#region only click the one which we need check, don't change already checked.
          const conditionToCheck = currentFilterConditions.filter(it => {
            if (placeholderText === '公司行业') {
              return !activeOptionValues.map(value => industryFilterConditionsMapByIndex[value].code).includes(it);
            } else {
              return !activeOptionValues.includes(it)
            }
          })
          for (let j = 0; j < conditionToCheck.length; j++) {
            let optionValue
            if (placeholderText === '公司行业') {
              optionValue = industryFilterConditionCodeToIndexMap[conditionToCheck[j]]
            } else {
              optionValue = conditionToCheck[j]
            }
            await sleepWithRandomDelay(500)
            await filterDropdownProxy.scrollIntoView()
            const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
            await page.mouse.move(
              filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
              filterDropdownElBBox.y + filterDropdownElBBox.height / 2,
            )
            await sleepWithRandomDelay(500)
            const optionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${optionValue}"]`)
            if (!optionElProxy) {
              continue;
            }
            await optionElProxy.click()
          }
          //#endregion
          //#region move out dropdown entry to make dropdown hidden
          const navBarLogoElProxy = await page.$(`[ka="header-home-logo"]`)
          if (navBarLogoElProxy) {
            const navBarLogoElBBox = await navBarLogoElProxy.boundingBox()
            await page.mouse.move(
              navBarLogoElBBox.x + navBarLogoElBBox.width / 2,
              navBarLogoElBBox.y + navBarLogoElBBox.height / 2,
            )
          }
          //#endregion
        }
        await sleepWithRandomDelay(500)
      }
    }
  }
}

async function toRecommendPage(hooks) {
  page.goto(recommendJobPageUrl, { timeout: 1 * 1000 }).catch(e => { void e })
  await sleep(3000)
  await waitForPageConditionWithRecovery(
    () => page.waitForFunction(() => {
      const pageMain = document.querySelector('.page-jobs-main')
      const jobList = document.querySelector('ul.rec-job-list')
      const jobDetail = document.querySelector('.job-detail-box')
      const loadingText = document.body?.innerText ?? ''
      const isStillLoading = /加载中，请稍候|加载中/.test(loadingText)
      return document.readyState !== 'loading' && Boolean(pageMain || jobList || jobDetail) && !isStillLoading
    }, { timeout: 30 * 1000 }),
    {
      tag: 'afterInitialNavigation',
      timeoutContext: 'toRecommendPage.documentReady',
      allowRetryWithoutSecurity: true,
      maxRetryCount: 10,
    }
  )
  if (isSecurityCheckUrl(page.url())) {
    await waitForManualSecurityRecovery({
      tag: 'afterInitialNavigation'
    })
  }
  if (
    page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
    page.url().startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    throw new Error("ACCESS_IS_DENIED")
  }

  await waitForPageConditionWithRecovery(
    () => page.waitForFunction(({ recommendJobPageUrl }) => {
      const pageMain = document.querySelector('.page-jobs-main')
      const jobList = document.querySelector('ul.rec-job-list')
      const jobDetail = document.querySelector('.job-detail-box')
      const loadingText = document.body?.innerText ?? ''
      const isStillLoading = /加载中，请稍候|加载中/.test(loadingText)
      return (
        location.href.startsWith(recommendJobPageUrl)
        && document.readyState !== 'loading'
        && Boolean(pageMain || jobList || jobDetail)
        && !isStillLoading
      )
    }, { timeout: 30 * 1000 }, { recommendJobPageUrl }),
    {
      tag: 'afterRecommendPageReady',
      timeoutContext: 'toRecommendPage.recommendPageReady',
      allowRetryWithoutSecurity: true,
      maxRetryCount: 10,
    }
  )

  hooks.pageLoaded?.call()

  let { apiResult: userInfoResponse } = await getLoginStatusSnapshot()
  await hooks.userInfoResponse?.promise(userInfoResponse)
  if (userInfoResponse?.code !== 0) {
    autoStartChatEventBus.emit('LOGIN_STATUS_INVALID', {
      userInfoResponse
    })
    writeStorageFile('boss-cookies.json', [])
    throw new Error("LOGIN_STATUS_INVALID")
  } else {
    await storeStorage(page).catch(() => void 0)
  }

  const computedSourceList = []
  for (const source of normalizedJobSource) {
    switch (source.type) {
      case 'recommend': {
        computedSourceList.push({
          type: source.type,
          keyword: null,
          runtimeProtectionKey: source.type,
          selector: RECOMMEND_JOB_ENTRY_SELECTOR,
          async getIsCurrentActiveSource() {
            return await page.evaluate(
              ({ RECOMMEND_JOB_ENTRY_SELECTOR }) => {
                return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR)?.classList?.contains('active') ?? false
              }, {
              RECOMMEND_JOB_ENTRY_SELECTOR
            }
            )
          },
          async setToActiveSource() {
            // not first navigation and should choose a job (except job)
            // click first expect job
            const expectJobTabHandler = await page.$(RECOMMEND_JOB_ENTRY_SELECTOR)
            await expectJobTabHandler.click() // switch to first condition
          }
        })
        continue
      }
      case 'expect': {
        await page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        const allExpectJobEntryHandles = await page.$$(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        allExpectJobEntryHandles.forEach((it, index) => {
          computedSourceList.push({
            type: source.type,
            keyword: null,
            runtimeProtectionKey: `${source.type}:${index}`,
            selector: `${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`,
            async getIsCurrentActiveSource() {
              return await page.evaluate(
                ({
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }) => {
                  return document.querySelector(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`)?.classList?.contains('active') ?? false
                }, {
                USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                index
              }
              )
            },
            async setToActiveSource() {
              // not first navigation and should choose a job (except job)
              // click first expect job
              const expectJobTabHandler = await page.$(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`)
              await expectJobTabHandler.click() // switch to first condition
            }
          })
        })
        break
      }
      case 'search': {
        computedSourceList.push({
          type: source.type,
          keyword: source.keyword?.trim() || null,
          runtimeProtectionKey: `${source.type}:${source.keyword?.trim() || ''}`,
          async getIsCurrentActiveSource() {
            const elHandle = await page.$(`.page-jobs-main`)
            const currentKeyWord = await elHandle?.evaluate((el) => {
              return el?.__vue__?.formData?.query
            })
            if (!currentKeyWord) {
              return false
            }
            return currentKeyWord === source.keyword
          },
          async setToActiveSource() {
            await page.waitForSelector(SEARCH_BOX_SELECTOR)
            const inputHandle = await page.$(`${SEARCH_BOX_SELECTOR} input`)
            await inputHandle.focus()
            await sleep(100)
            let currentValue = await inputHandle.evaluate(el => el.value)
            while (currentValue) {
              await inputHandle.press('Backspace')
              currentValue = await inputHandle.evaluate(el => el.value)
            }
            await inputHandle.type(source.keyword?.trim() || '', { delay: 100 })
            await sleep(500)
            await inputHandle.press('Enter')
          }
        })
      }
    }
  }

  let currentSourceIndex = 0
  const isSourceBlockedByRuntimeProtection = (source) => {
    if (!source) {
      return true
    }
    return (
      (isReliabilityProtectionEnabled &&
        runtimeProtectionManager.isSourceDegraded(
          source.runtimeProtectionKey ?? source.type
        )) ||
      (isSearchKeywordDegradationEnabled &&
        source.keyword &&
        runtimeProtectionManager.isKeywordDegraded(source.keyword))
    )
  }
  const getNextSourceIndex = ({ excludeCurrent = false } = {}) => {
    if (!computedSourceList.length) {
      return -1
    }
    for (let offset = 1; offset <= computedSourceList.length; offset++) {
      const candidateIndex = (currentSourceIndex + offset) % computedSourceList.length
      if (excludeCurrent && candidateIndex === currentSourceIndex) {
        continue
      }
      const candidateSource = computedSourceList[candidateIndex]
      if (!isSourceBlockedByRuntimeProtection(candidateSource)) {
        return candidateIndex
      }
    }
    return -1
  }
  const moveToNextSource = async ({
    excludeCurrent = false,
    stopRunReason = null
  } = {}) => {
    const nextSourceIndex = getNextSourceIndex({ excludeCurrent })
    if (nextSourceIndex < 0) {
      throw new Error(
        `RUNTIME_PROTECTION_STOP_RUN:${stopRunReason ?? 'No available source remains after runtime protection degradation.'}`
      )
    }

    if (nextSourceIndex <= currentSourceIndex) {
      hooks.noPositionFoundForCurrentJob?.call()
      hooks.noPositionFoundAfterTraverseAllJob?.call()
      await sleep((20 + 30 * Math.random()) * 1000)
      await Promise.all([
        page.goto(`https://www.zhipin.com/web/geek/jobs`),
        page.waitForNavigation()
      ])
      currentSourceIndex = nextSourceIndex
      return
    }

    hooks.noPositionFoundForCurrentJob?.call()
    await sleep((10 + 15 * Math.random()) * 1000)
    currentSourceIndex = nextSourceIndex
  }
  afterPageLoad: while (true) {
    // check set security question tip modal
    let setSecurityQuestionTipModelProxy
    try {
      setSecurityQuestionTipModelProxy = await page.waitForSelector('.dialog-wrap.dialog-account-safe', { timeout: 3 * 1000 })
    }
    catch (err) {
      console.log(`cannot find set security question tip modal, just continue`)
    }
    if (
      setSecurityQuestionTipModelProxy
    ) {
      await sleep(1000)
      setSecurityQuestionTipModelProxy = await page.$('.dialog-wrap.dialog-account-safe')
      const closeButtonProxy = await setSecurityQuestionTipModelProxy?.$('.close')

      if (setSecurityQuestionTipModelProxy && closeButtonProxy) {
        await closeButtonProxy.click()
      }
    }

    const filterConditions =
      combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE
        ? formatStaticCombineFilters(staticCombineRecommendJobFilterConditions)
        : combineFiltersWithConstraintsGenerator(anyCombineRecommendJobFilter)
    let expectJobList
    let filterConditionIndex = -1
    iterateFilterCondition: for (
      const filterCondition of filterConditions
    ) {
      const currentSource = computedSourceList[currentSourceIndex]
      if (isReliabilityProtectionEnabled) {
        runtimeProtectionManager.setCurrentSource(
          currentSource?.runtimeProtectionKey ?? currentSource?.type ?? 'unknown'
        )
      }
      if (isSearchKeywordDegradationEnabled) {
        runtimeProtectionManager.setCurrentKeyword(currentSource?.keyword ?? null)
      }
      if (isSourceBlockedByRuntimeProtection(currentSource)) {
        await moveToNextSource({
          excludeCurrent: true,
          stopRunReason: 'No available source remains after runtime protection degraded the current source.'
        })
        continue afterPageLoad
      }
      filterConditionIndex++
      const effectiveFilterCondition = mergeRuntimeHardFilters(filterCondition)
      console.log(`current filter condition index to apply: ${filterConditionIndex}`, JSON.stringify(effectiveFilterCondition))
      findInCurrentFilterCondition: while (true) {
        await sleepWithRandomDelay(2500)
        try {
          throwIfSecurityCheckTriggered('beforeWaitRecommendPageReady')
          await waitForRecommendPageReady()
          throwIfSecurityCheckTriggered('afterWaitRecommendPageReady')
          // await page.click(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
          await sleep(3000)
          let onPageCurrentSourceIndex = -1
          for (let i = 0; i < computedSourceList.length; i++) {
            const computedSource = computedSourceList[i]
            if (await computedSource.getIsCurrentActiveSource()) {
              onPageCurrentSourceIndex = i
              break
            }
          }
          throwIfSecurityCheckTriggered('afterSourceIndexCheck')
          if (
            (
              combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE && filterCondition === null
            )
            ||
            (
              combineRecommendJobFilterType === CombineRecommendJobFilterType.ANY_COMBINE &&
              isSkipEmptyConditionForCombineRecommendJobFilter &&
              Object.keys(effectiveFilterCondition).length &&
              Object.keys(effectiveFilterCondition).every(k => !effectiveFilterCondition[k]?.length)
            )
          ) {
            sleep(4000)
            continue iterateFilterCondition
          }
          expectJobList = await page.evaluate(`document.querySelector('.c-expect-select')?.__vue__?.expectList`)
          if (onPageCurrentSourceIndex === currentSourceIndex) {
            // first navigation and can immediately start chat (recommend job)
          } else {
            await computedSourceList[currentSourceIndex].setToActiveSource()
            await page.waitForResponse(
              response => {
                if (
                  response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                  response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
                ) {
                  return true
                }
                return false
              }
            );
            await storeStorage(page).catch(() => void 0)
            await sleepWithRandomDelay(2000)
            await waitForSageTimeOrJustContinue({
              tag: 'afterJobSourceChosen',
              hooks
            })
          }
          throwIfSecurityCheckTriggered('beforeApplyFilterCondition')
          await sleepWithRandomDelay(1500)
          await setFilterCondition(effectiveFilterCondition)
          throwIfSecurityCheckTriggered('afterApplyFilterCondition')
          await sleep(1500) // TODO: accurately check if job list request sent and response received after set condition
          await page.waitForFunction(() => {
            return !document.querySelector('.job-recommend-result .job-rec-loading')
          })
          throwIfSecurityCheckTriggered('afterRecommendLoading')
        } catch (err) {
          if (
            (err instanceof Error && err.message.includes('SECURITY_CHECK_TRIGGERED'))
            || (
              isPuppeteerTimeoutError(err)
              && isSecurityCheckUrl(page?.url?.() ?? '')
            )
          ) {
            await waitForManualSecurityRecovery({
              tag: err instanceof Error ? err.message : 'waitForRecommendPageReady'
            })
            continue findInCurrentFilterCondition
          }
          if (
            isPuppeteerTimeoutError(err)
            && (
              (page?.url?.() ?? '').startsWith(recommendJobPageUrl)
              || (page?.url?.() ?? '').startsWith(loginEntryUrl)
            )
          ) {
            console.warn('[toRecommendPage] Timeout while waiting recommend page state, retry current condition.')
            await sleep(3000)
            continue findInCurrentFilterCondition
          }
          if (isIgnorablePageLifecycleError(err)) {
            console.warn('[toRecommendPage] Page lifecycle changed while applying filter condition, retry current condition.')
            await waitForRecommendPageReady().catch(() => void 0)
            continue findInCurrentFilterCondition
          }
          throw err
        }
        try {
          const { targetJobIndex, targetJobData } = await new Promise(async (resolve, reject) => {
            try {
              let requestNextPagePromiseWithResolver = null
              page.on(
                'request',
                function reqHandler(request) {
                  if (
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
                  ) {
                    requestNextPagePromiseWithResolver = (() => {
                      const o = {}
                      o.promise = new Promise((resolve, reject) => {
                        o.resolve = resolve
                        o.reject = reject
                      })
                      return o
                    })()
                    page.off(reqHandler)

                    page.on(
                      'response',
                      function resHandler(response) {
                        if (response.request() === request) {
                          requestNextPagePromiseWithResolver?.resolve()
                          page.off(resHandler)
                        }
                      }
                    )
                  }
                }
              )
              // job list
              let recommendJobListElProxy
              try {
                recommendJobListElProxy = await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
              } catch { }
              if (!recommendJobListElProxy) {
                throwIfSecurityCheckTriggered('recommendJobListMissing')
                await hooks.encounterEmptyRecommendJobList?.promise({
                  pageQuery: await page.evaluate(() => new URL(location.href).searchParams.toString())
                })
                throw new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION')
              }
              async function getRecommendJobListElProxy() {
                const nextProxy = await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
                recommendJobListElProxy = nextProxy
                return nextProxy
              }
              let jobListData = []
              async function updateJobListData() {
                jobListData = await safeEvaluatePage(
                  () => page.evaluate(`document.querySelector('.page-jobs-main')?.__vue__?.jobList`),
                  {
                    defaultValue: [],
                    label: 'updateJobListData'
                  }
                )
                jobListData.forEach(it => {
                  const skipInfo = evaluateJobForListSkip(it, runtimeEvaluationConfig)
                  if (skipInfo.shouldSkip) {
                    blockJobNotSuit.add(it.encryptJobId)
                  }
                })
                const currentSource = computedSourceList[currentSourceIndex]
                if (currentSource?.type === 'search' && currentSource.keyword) {
                  const driftCheckResult = detectSearchKeywordDrift(jobListData, currentSource.keyword)
                  if (driftCheckResult.drifted) {
                    console.warn(
                      `[SearchKeywordDrift] Keyword "${currentSource.keyword}" drifted out of the current recommendation list after checking ${driftCheckResult.checkedCount} jobs.`
                    )
                    runtimeProtectionManager.markCurrentKeywordDegraded('top search results no longer match the current keyword')
                    return {
                      keywordDrifted: true
                    }
                  }
                }
                return {
                  keywordDrifted: false
                }
              }
              let updateJobListResult = await updateJobListData()
              if (updateJobListResult?.keywordDrifted) {
                throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
              }

              let hasReachLastPage = false
              let targetJobIndex = -1
              let targetJobData, selectedJobData // they show be same; one is from list, another is from detail
              function getTempTargetJobIndexToCheckDetail() {
                return jobListData.findIndex(it => {
                  const listSkipInfo = evaluateJobForListSkip(it, runtimeEvaluationConfig)
                  const companyMatched = enableCompanyAllowList ?
                    [...expectCompanySet].find(
                      name => it.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                    ) :
                    true
                  return !blockBossNotNewChat.has(it.encryptBossId) &&
                    !blockBossNotActive.has(it.encryptBossId) &&
                    !blockJobNotSuit.has(it.encryptJobId) &&
                    (
                      companyMatched || listSkipInfo.shouldEnterDetail
                    )
                })
              }
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                // when disable company allow list, we will believe that the first one in the list is your expect job.
                let tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                while (tempTargetJobIndexToCheckDetail < 0 && !hasReachLastPage) {
                  // fetch new
                  let recommendJobListElBBox
                  try {
                    const currentRecommendJobListElProxy = await getRecommendJobListElProxy()
                    recommendJobListElBBox = await currentRecommendJobListElProxy.boundingBox()
                  } catch (err) {
                    if (isIgnorablePageLifecycleError(err)) {
                      console.warn('[toRecommendPage] Recommend list lifecycle changed while preparing next page fetch, retry current candidate.')
                      await waitForRecommendPageReady().catch(() => void 0)
                      continue continueFind
                    }
                    throw err
                  }
                  if (!recommendJobListElBBox) {
                    await waitForRecommendPageReady().catch(() => void 0)
                    continue continueFind
                  }
                  const windowInnerHeight = await page.evaluate('window.innerHeight')
                  await page.mouse.move(
                    recommendJobListElBBox.x + recommendJobListElBBox.width / 2,
                    windowInnerHeight / 2
                  )
                  let scrolledHeight = 0
                  const increase = 40 + Math.floor(30 * Math.random())

                  while (
                    !requestNextPagePromiseWithResolver &&
                    !hasReachLastPage
                  ) {
                    scrolledHeight += increase
                    await page.mouse.wheel({ deltaY: increase });
                    await sleep(100)
                    await requestNextPagePromiseWithResolver?.promise
                    hasReachLastPage = await safeEvaluatePage(
                      () => page.evaluate(`
                        !(document.querySelector('.page-jobs-main')?.__vue__?.hasMore)
                      `),
                      {
                        defaultValue: false,
                        label: 'recommendJobList.hasReachLastPage'
                      }
                    )
                    if (hasReachLastPage) {
                      console.log(`Arrive the terminal of the job list.`)
                    }
                  }
                  requestNextPagePromiseWithResolver = null
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobListPageFetched',
                    hooks
                  })
                  await sleep(5000)
                  updateJobListResult = await updateJobListData()
                  if (updateJobListResult?.keywordDrifted) {
                    throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                  }
                  tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                }

                if (tempTargetJobIndexToCheckDetail < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }

                //#region here to check detail
                if (tempTargetJobIndexToCheckDetail >= 0) {
                  try {
                    // scroll that target element into view
                    await page.evaluate(`
                      targetEl = document.querySelector("ul.rec-job-list").children[${tempTargetJobIndexToCheckDetail}]
                      targetEl.scrollIntoView({
                        behavior: 'smooth',
                        block: ${Math.random() > 0.5 ? '\'center\'' : '\'end\''}
                      })
                    `)

                    await sleepWithRandomDelay(200)

                    if (tempTargetJobIndexToCheckDetail === 0) {
                    } else {
                      const currentRecommendJobListElProxy = await getRecommendJobListElProxy()
                      const recommendJobItemList = await currentRecommendJobListElProxy.$$('ul.rec-job-list li.job-card-box')
                      const targetJobElProxy = recommendJobItemList[tempTargetJobIndexToCheckDetail]
                      if (!targetJobElProxy) {
                        await waitForRecommendPageReady().catch(() => void 0)
                        continue continueFind
                      }
                      // click that element
                      await sleep(500)
                      await targetJobElProxy.click()
                      await page.waitForResponse(
                        response => {
                          if (
                            response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')
                          ) {
                            return true
                          }
                          return false
                        }
                      );
                      await sleepWithRandomDelay(2000)
                    }
                  } catch (err) {
                    if (isIgnorablePageLifecycleError(err)) {
                      console.warn('[toRecommendPage] Recommend list lifecycle changed while opening job detail, retry current candidate.')
                      await waitForRecommendPageReady().catch(() => void 0)
                      continue continueFind
                    }
                    throw err
                  }
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobDetailFetched',
                    hooks
                  })
                  const detailSnapshot = await getRecommendJobDetailSnapshot()
                  targetJobData = detailSnapshot.targetJobData
                  selectedJobData = detailSnapshot.selectedJobData
                  if (!targetJobData?.jobInfo?.encryptId || !selectedJobData?.encryptJobId) {
                    console.warn(
                      '[afterJobDetailFetched] Job detail snapshot is not ready, skip current candidate.',
                      JSON.stringify({
                        hasDetailVm: detailSnapshot.hasDetailVm,
                        hasPageJobsVm: detailSnapshot.hasPageJobsVm,
                        hasTargetJobId: !!targetJobData?.jobInfo?.encryptId,
                        hasSelectedJobId: !!selectedJobData?.encryptJobId
                      })
                    )
                    await sleepWithRandomDelay(800)
                    continue continueFind
                  }
                  // save the job detail info
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)
                  if (isSearchKeywordDegradationEnabled) {
                    runtimeProtectionManager.recordJobSeen()
                  }

                  const currentListJobData = jobListData[tempTargetJobIndexToCheckDetail]
                  if (isReliabilityProtectionEnabled) {
                    const reliabilityCheckResult = runtimeProtectionManager.validateJobReliability(
                      currentListJobData,
                      selectedJobData,
                      targetJobData
                    )
                    if (!reliabilityCheckResult.isReliable) {
                      const currentSource = computedSourceList[currentSourceIndex]
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (isSearchKeywordDegradationEnabled) {
                        runtimeProtectionManager.recordJobRejected()
                      }
                      runtimeProtectionManager.recordUnreliableResult(
                        currentSource?.runtimeProtectionKey ?? currentSource?.type ?? 'unknown',
                        reliabilityCheckResult.rejectReasons
                      )
                      if (runtimeProtectionManager.shouldStopRun()) {
                        throw new Error(`RUNTIME_PROTECTION_STOP_RUN:${runtimeProtectionManager.getStopRunReason() ?? 'unknown'}`)
                      }
                      if (
                        currentSource?.runtimeProtectionKey &&
                        runtimeProtectionManager.isSourceDegraded(currentSource.runtimeProtectionKey)
                      ) {
                        throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                      }
                      if (
                        isSearchKeywordDegradationEnabled &&
                        runtimeProtectionManager.checkKeywordDegradation()
                      ) {
                        throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                      }
                      continue continueFind
                    }
                  }

                  //#region collect not suit reasons
                  const evaluationResult = evaluateJobEligibility(
                    targetJobData,
                    runtimeEvaluationConfig,
                    {
                      selectedJobData,
                      currentSourceType: computedSourceList[currentSourceIndex]?.type
                    }
                  )
                  const notSuitReasonIdToStrategyMap = {
                    ...(evaluationResult.strategyMap ?? {})
                  }
                  const notSuitConditionHandleMap = {
                    async companyName() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL && !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async active() {
                      blockBossNotActive.add(targetJobData.jobInfo.encryptUserId)
                      if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.BOSS_INACTIVE)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async city() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark job city not suit failed`, err)
                        }
                      }
                    },
                    async workExp() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark job work exp not suit failed`, err)
                        }
                      }
                    },
                    async jobDetail() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark job detail not suit failed`, err)
                        }
                      }
                    },
                    async salary() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch (err) {
                          console.log(`mark job salary not suit failed`, err)
                        }
                      }
                    }
                  }

                  console.log('not suit reason and related strategy: ', notSuitReasonIdToStrategyMap)

                  // #region execute mark logic
                  // 1. find the one mark on Boss
                  const markOnBossCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS)
                  if (markOnBossCondition) {
                    if (isSearchKeywordDegradationEnabled) {
                      runtimeProtectionManager.recordJobRejected()
                    }
                    if (
                      isSearchKeywordDegradationEnabled &&
                      runtimeProtectionManager.checkKeywordDegradation()
                    ) {
                      throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                    }
                    await notSuitConditionHandleMap[markOnBossCondition]()
                    continue continueFind
                  }
                  // 2. if there is no condition to mark Boss, then find the one mark on local db
                  const markOnLocalDbCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL)
                  if (markOnLocalDbCondition) {
                    if (isSearchKeywordDegradationEnabled) {
                      runtimeProtectionManager.recordJobRejected()
                    }
                    if (
                      isSearchKeywordDegradationEnabled &&
                      runtimeProtectionManager.checkKeywordDegradation()
                    ) {
                      throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                    }
                    await notSuitConditionHandleMap[markOnLocalDbCondition]()
                    continue continueFind
                  }
                  // 3.
                  const noOpCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.NO_OP)
                  if (noOpCondition) {
                    if (isSearchKeywordDegradationEnabled) {
                      runtimeProtectionManager.recordJobRejected()
                    }
                    if (
                      isSearchKeywordDegradationEnabled &&
                      runtimeProtectionManager.checkKeywordDegradation()
                    ) {
                      throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                    }
                    await notSuitConditionHandleMap[noOpCondition]()
                    continue continueFind
                  }
                  // #endregion
                  if (
                    // test company again - when allow list not include target company, just skip
                    enableCompanyAllowList && ![...expectCompanySet].find(
                      name => selectedJobData.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                    ) ||
                    // check if job has been marked as not suit or not active
                    [
                      ...blockJobNotSuit,
                      ...blockBossNotActive
                    ].includes(targetJobData.jobInfo.encryptId)
                  ) {
                    // just skip
                    continue continueFind
                  }
                  const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
                  if (startChatButtonInnerHTML !== '立即沟通') {
                    blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
                    continue continueFind
                  }
                  targetJobIndex = tempTargetJobIndexToCheckDetail
                  //#endregion
                }

                if (targetJobIndex < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }
              }

              resolve(
                {
                  targetJobIndex,
                  targetJobData
                }
              )
            } catch (err) {
              reject(err)
            }
          })
          await waitForSageTimeOrJustContinue({
            tag: 'beforeJobChatStartup',
            hooks
          })
          await sleepWithRandomDelay(1000)
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')

          await hooks.newChatWillStartup?.promise(targetJobData)
          const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
          await sleep(500)
          const waitAddFriendResponse = async () => {
            const addFriendResponse = await page.waitForResponse(
              response => {
                if (
                  response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json') && response.url().includes(`jobId=${targetJobData.jobInfo.encryptId}`)
                ) {
                  return true
                }
                return false
              }
            );
            const res = await addFriendResponse.json()
            return res
          }
          const clickAndWaitAddFriendResponse = async (buttonHandle) => {
            const [res] = await Promise.all([
              waitAddFriendResponse(),
              buttonHandle.click()
            ])
            return res
          }
          const waitAndHandleChatSuccess = async () => {
            console.log(
              '[ChatStartupSuccess]',
              JSON.stringify({
                encryptJobId: targetJobData?.jobInfo?.encryptId ?? null,
                encryptBossId: targetJobData?.jobInfo?.encryptUserId ?? null,
                jobSource: JobSource[computedSourceList[currentSourceIndex]?.type] ?? null
              })
            )
            try {
              await hooks.newChatStartup?.promise(
                targetJobData,
                {
                  chatStartupFrom: ChatStartupFrom.AutoFromRecommendList,
                  jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                }
              )
            } catch (err) {
              console.warn('[ChatStartupSuccess] newChatStartup hook failed but chat has already started.', stringifyErrorWithCause(err))
            }
            blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
            if (isSearchKeywordDegradationEnabled) {
              runtimeProtectionManager.recordJobGreeted()
            }
            try {
              await storeStorage(page)
            } catch (err) {
              console.warn('[ChatStartupSuccess] storeStorage failed after chat startup.', stringifyErrorWithCause(err))
            }
            try {
              await sleepWithRandomDelay(1500)
              const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
              await closeDialogButtonProxy?.click?.()
              await sleepWithRandomDelay(2000)
            } catch (err) {
              console.warn('[ChatStartupSuccess] failed to close greet dialog after chat startup.', stringifyErrorWithCause(err))
            }
          }
          const detectChatStartupSuccess = async () => {
            try {
              return await page.evaluate((encryptBossId) => {
                const chatDialog = document.querySelector('.greet-boss-dialog')
                if (chatDialog) {
                  return true
                }

                const chatFrame = document.querySelector('.chat-content, .im-content-wrap, .chat-main')
                if (chatFrame) {
                  return true
                }

                const currentUrl = window.location.href
                if (
                  typeof currentUrl === 'string'
                  && currentUrl.includes('/web/geek/chat')
                  && currentUrl.includes(encryptBossId)
                ) {
                  return true
                }

                return false
              }, targetJobData.jobInfo.encryptUserId)
            } catch {
              return false
            }
          }
          const handleAddFriendResponse = async (res) => {
            const chatRemindDialog = res?.zpData?.bizData?.chatRemindDialog
            const chatRemindTitle = chatRemindDialog?.title ?? ''
            const chatRemindContent = chatRemindDialog?.content ?? ''
            const isWorkExpMismatchReminder = (
              res?.zpData?.bizCode === 1
              && chatRemindDialog?.blockLevel === 0
              && (
                /工作经历不匹配/.test(chatRemindTitle)
                || /工作经历不匹配/.test(chatRemindContent)
              )
            )
            const shouldConfirmContinue = (
              res?.zpData?.bizCode === 1
              && (
                (
                  chatRemindDialog?.blockLevel === 0
                  && /剩\d+次沟通机会/.test(chatRemindContent)
                )
                || /猎头/.test(chatRemindContent)
                || chatRemindDialog?.buttonList?.some(button => {
                  return (
                    typeof button?.text === 'string'
                    && button.text.includes('继续')
                  )
                })
              )
            )
            if (res.code === 0) {
              await waitAndHandleChatSuccess()
            }
            else if (shouldConfirmContinue) {
              console.log(
                '[ChatStartupConfirmRequired]',
                JSON.stringify({
                  bizCode: res?.zpData?.bizCode ?? null,
                  chatRemindContent,
                  buttonList: chatRemindDialog?.buttonList?.map(button => button?.text).filter(Boolean) ?? [],
                  blockLevel: chatRemindDialog?.blockLevel ?? null
                })
              )
              await waitForSageTimeOrJustContinue({
                tag: 'beforeJobChatStartupAfterTwiceConfirm',
                hooks
              })
              const confirmButton = await findContinueConfirmButton(page)
              if (confirmButton) {
                const nextRes = await clickAndWaitAddFriendResponse(confirmButton)
                await handleAddFriendResponse(nextRes)
                return
              }

              await sleepWithRandomDelay(2000)
              if (await detectChatStartupSuccess()) {
                await waitAndHandleChatSuccess()
                return
              }

              console.warn(
                '[ChatStartupConfirmRequired] confirm button was not found and chat startup was not detected.',
                JSON.stringify(await getChatConfirmDiagnostics(page))
              )
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_CONFIRM_DIALOG_NOT_RENDERED')
            }
            else if (
              res.zpData.bizCode === 1 &&
              chatRemindDialog?.blockLevel === 0 &&
              (
                chatRemindContent === `今日沟通人数已达上限，请明天再试` ||
                /明天再来/.test(chatRemindContent)
              )
            ) {
              // startup chat error, may the chance of today has used out
              await storeStorage(page).catch(() => void 0)
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
            }
            else if (isWorkExpMismatchReminder) {
              console.warn(
                '[ChatStartupSkippedDueToWorkExpMismatch]',
                JSON.stringify({
                  title: chatRemindTitle,
                  content: chatRemindContent,
                  encryptJobId: targetJobData?.jobInfo?.encryptId ?? null,
                  encryptBossId: targetJobData?.jobInfo?.encryptUserId ?? null
                })
              )
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_WORK_EXP_MISMATCH')
            }
            else {
              console.error(
                JSON.stringify(res, null, 2)
              )
              throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
            }
          }
          //#region click the chat button
          const res = await clickAndWaitAddFriendResponse(startChatButtonProxy)
          await handleAddFriendResponse(res)
          // #endregion
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION': {
                await sleepWithRandomDelay(25 * 1000)
                continue iterateFilterCondition;
              }
              case 'STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT': {
                let nextTrySeconds = 60 * 60
                const msg = `Today chance has used out. Just explore positions you\'ve chatted. New chat will be tried to start after ${nextTrySeconds} seconds.`
                hooks.errorEncounter?.call(msg)
                console.error(msg)
                await sleep(nextTrySeconds * 1000)
                throw err
              }
              case 'STARTUP_CHAT_ERROR_DUE_TO_WORK_EXP_MISMATCH': {
                try {
                  blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                  if (isSearchKeywordDegradationEnabled) {
                    runtimeProtectionManager.recordJobRejected()
                    if (runtimeProtectionManager.checkKeywordDegradation()) {
                      throw new Error('RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE')
                    }
                  }
                  await hooks.jobMarkedAsNotSuit.promise(targetJobData, {
                    markFrom: ChatStartupFrom.AutoFromRecommendList,
                    markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                    extInfo: {
                      title: '工作经历不匹配',
                      content: 'BOSS blocked startup chat because work experience does not match.'
                    },
                    markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                    jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                  })
                } catch (markErr) {
                  console.warn(
                    '[ChatStartupSkippedDueToWorkExpMismatch] Failed to store local not-suit record.',
                    stringifyErrorWithCause(markErr)
                  )
                }
                continue iterateFilterCondition;
              }
              case 'STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR': {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
              case 'STARTUP_CHAT_ERROR_DUE_TO_CONFIRM_DIALOG_NOT_RENDERED': {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
              case 'RUNTIME_PROTECTION_SKIP_CURRENT_SOURCE': {
                await moveToNextSource({
                  excludeCurrent: true,
                  stopRunReason: 'No available source remains after runtime protection degraded the current source.'
                })
                continue afterPageLoad
              }
              default: {
                if (err.message.startsWith('RUNTIME_PROTECTION_STOP_RUN:')) {
                  hooks.errorEncounter?.call(err.message)
                  throw err
                }
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
            }
          } else {
            hooks.errorEncounter?.call(err)
            throw err
          }
        }
      }
    }
    // for of reach terminal
    if (
      currentSourceIndex + 1 >= computedSourceList.length
    ) {
      await moveToNextSource()
    } else {
      await moveToNextSource()
    }
  }
}

export async function mainLoop(hooks) {
  if (!puppeteer) {
    await initPuppeteer()
  }
  try {
    const launchOptions = {
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      }
    }
    if (puppeteerUserDataDir) {
      launchOptions.userDataDir = puppeteerUserDataDir
      console.log(`[initPuppeteer] Using fixed userDataDir: ${puppeteerUserDataDir}`)
    }
    browser = await puppeteer.launch(launchOptions)
    hooks.puppeteerLaunched?.call(browser)
    try {
      const { writeFileSync } = await import('node:fs')
      const { dirname, resolve } = await import('node:path')
      const browserWsFilePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../ops/browser_ws.txt')
      writeFileSync(browserWsFilePath, browser.wsEndpoint())
    } catch (e) { }
    page = (await browser.pages())[0]
    hooks.pageGotten?.call(page)
    //set cookies
    const bossCookies = readStorageFile('boss-cookies.json')
    const bossLocalStorage = readStorageFile('boss-local-storage.json')
    await hooks.cookieWillSet?.promise(bossCookies)
    for (let i = 0; i < bossCookies.length; i++) {
      if (Object.hasOwn(bossCookies[i], 'sameSite')) {
        bossCookies[i].sameSite = 'unspecified'
      }
      await page.setCookie(bossCookies[i]);
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
    await page.bringToFront()
    // __GGR_INJECT_ANTI_ANTI_DEBUGGER__
    await hooks.mainFlowWillLaunch?.promise({
      jobNotMatchStrategy,
      jobNotActiveStrategy,
      expectCityNotMatchStrategy,
      blockJobNotSuit,
      blockBossNotActive,
      blockBossNotNewChat
    })
    await toRecommendPage(hooks)
    // goto search

    // ;await browser.close()
  } catch (err) {
    closeBrowserWindow()
    throw err
  }
}

export async function closeBrowserWindow() {
  browser?.close()
  const browserProcess = browser?.process()
  if (browserProcess) {
    try {
      process.kill(browserProcess.pid)
    }
    catch { }
  }
  browser = null
  page = null
}

async function storeStorage(page) {
  const [
    cookies, localStorage
  ] = await Promise.all([
    page.cookies(),
    page.evaluate(() => {
      return JSON.stringify(window.localStorage)
    }).then(res => JSON.parse(res))
  ])
  return Promise.all(
    [
      writeStorageFile('boss-cookies.json', cookies),
      writeStorageFile('boss-local-storage.json', localStorage),
    ]
  )
}
