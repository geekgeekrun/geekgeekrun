import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils/sleep.mjs'

import fs from 'node:fs'
import os from 'node:os'
import { get__dirname } from '@geekgeekrun/utils/legacy-path.mjs';
import path from 'node:path';
import JSON5 from 'json5'
import { EventEmitter } from 'node:events'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'

import { readConfigFile, writeStorageFile, ensureConfigFileExist, readStorageFile, ensureStorageFileExist } from './runtime-file-utils.mjs'
import {
  calculateTotalCombinations,
  combineFiltersWithConstraintsGenerator,
  checkAnyCombineBossRecommendFilterHasCondition
} from './combineCalculator.mjs'
import { default as jobFilterConditions } from './internal-config/job-filter-conditions-20241002.json'
import { default as rawIndustryFilterExemption } from './internal-config/job-filter-industry-filter-exemption-20241002.json'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import { MarkAsNotSuitReason, MarkAsNotSuitOp, StrategyScopeOptionWhenMarkJobNotMatch, SalaryCalculateWay, JobDetailRegExpMatchLogic } from '@geekgeekrun/sqlite-plugin/dist/enums'
import { activeDescList } from './constant.mjs'
import { parseSalary } from "@geekgeekrun/sqlite-plugin/dist/utils/parser"
const jobFilterConditionsMapByCode = {}
Object.values(jobFilterConditions).forEach(arr => {
  arr.forEach(option => {
    jobFilterConditionsMapByCode[option.code] = option
  })
})

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
export async function initPuppeteer () {
  // production
  const importResult = await Promise.all(
    [
      import('puppeteer-extra'),
      import('puppeteer-extra-plugin-stealth')
    ]
  )
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  puppeteer.use(StealthPlugin())

  return {
    puppeteer,
    StealthPlugin
  }
}

const bossCookies = readStorageFile('boss-cookies.json')
const bossLocalStorage = readStorageFile('boss-local-storage.json')

const targetCompanyList = readConfigFile('target-company-list.json').filter(it => !!it.trim());

const anyCombineRecommendJobFilter = readConfigFile('boss.json').anyCombineRecommendJobFilter
let isSkipEmptyConditionForCombineRecommendJobFilter = readConfigFile('boss.json').isSkipEmptyConditionForCombineRecommendJobFilter
if (!checkAnyCombineBossRecommendFilterHasCondition(anyCombineRecommendJobFilter)) {
  isSkipEmptyConditionForCombineRecommendJobFilter = false
}
const expectJobRegExpStr = readConfigFile('boss.json').expectJobRegExpStr
const jobNotMatchStrategy = readConfigFile('boss.json').jobNotMatchStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS

const expectCityNotMatchStrategy = readConfigFile('boss.json').expectCityNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const expectCityList = readConfigFile('boss.json').expectCityList ?? []

const strategyScopeOptionWhenMarkJobCityNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobCityNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// salary
const expectSalaryLow = parseFloat(readConfigFile('boss.json').expectSalaryLow) || null
const expectSalaryHigh = parseFloat(readConfigFile('boss.json').expectSalaryHigh) || null
const expectSalaryCalculateWay = readConfigFile('boss.json').expectSalaryCalculateWay ?? SalaryCalculateWay.MONTH_SALARY
const expectSalaryNotMatchStrategy = readConfigFile('boss.json').expectSalaryNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const isSalaryFilterEnabled = expectSalaryLow || expectSalaryHigh
const strategyScopeOptionWhenMarkSalaryNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkSalaryNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// work exp
const expectWorkExpList = readConfigFile('boss.json').expectWorkExpList ?? []
const expectWorkExpNotMatchStrategy = readConfigFile('boss.json').expectWorkExpNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const strategyScopeOptionWhenMarkJobWorkExpNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobWorkExpNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

let jobDetailRegExpMatchLogic = readConfigFile('boss.json').jobDetailRegExpMatchLogic ?? JobDetailRegExpMatchLogic.EVERY

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
} = readConfigFile('boss.json')
if (
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

const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const recommendJobPageUrl = `https://www.zhipin.com/web/geek/jobs`

const expectCompanySet = new Set(targetCompanyList)
const enableCompanyAllowList = Boolean(expectCompanySet.size)

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

async function markJobAsNotSuitInRecommendPage (reasonCode) {
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
    for(const it of rawReasonResData) {
      reasonCodeToTextMap[it.code] = it.text?.content ?? ''
    }
    await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    await sleepWithRandomDelay(2000)
    const chooseReasonDialogProxy = await(async() => {
      const alls = await page.$$('.zp-dialog-wrap.zp-feedback-dialog.v-transfer-dom')
      return alls?.[alls.length - 1]
    })()
    let isOptionChosen = false
    if (chooseReasonDialogProxy) {
      switch (reasonCode) {
        case MarkAsNotSuitReason.BOSS_INACTIVE: {
          const bossNotActiveOptionProxy = await chooseReasonDialogProxy.$(`.zp-type-item[title="BOSS活跃度低"]`)
          if (bossNotActiveOptionProxy) {
            await bossNotActiveOptionProxy.click()
            isOptionChosen = true
          } else {
            const recruitStoppedOptionProxy = await chooseReasonDialogProxy.$(`.zp-type-item[title="职位停招/招满"]`)
            if (recruitStoppedOptionProxy) {
              await recruitStoppedOptionProxy.click()
              isOptionChosen = true
            }
          }
          break
        }
        case MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT:
        case MarkAsNotSuitReason.JOB_CITY_NOT_SUIT:
        case MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="同城距离远"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="公司不感兴趣"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_NOT_SUIT:
        default: {
          const jobNotSuitOptionProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="职位"]`)) ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
          if (jobNotSuitOptionProxy) {
            await jobNotSuitOptionProxy.click()
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

export function testIfJobTitleOrDescriptionSuit (jobInfo, matchLogic) {
  let isJobNameSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobNameRegExpStr.trim()) {
      const regExp = new RegExp(expectJobNameRegExpStr, 'i')
      isJobNameSuit = regExp.test(jobInfo.jobName)
    }
  } catch {
  }
  let isJobTypeSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobTypeRegExpStr.trim()) {
      const regExp = new RegExp(expectJobTypeRegExpStr, 'i')
      isJobTypeSuit = regExp.test(jobInfo.positionName)
    }
  } catch {
  }
  let isJobDescSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobDescRegExpStr.trim()) {
      const regExp = new RegExp(expectJobDescRegExpStr, 'i')
      isJobDescSuit = regExp.test(jobInfo.postDescription)
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

async function setFilterCondition (selectedFilters) {
  const {
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  const placeholderTexts = ['薪资待遇', '工作经验', '学历要求', '公司行业', '公司规模']
  const optionKaPrefixes = ['sel-job-rec-salary-', 'sel-job-rec-exp-', 'sel-job-rec-degree-', 'sel-industry-', 'sel-job-rec-scale-']
  const conditionArr = [salaryList, experienceList, degreeList, industryList, scaleList]

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
  for(let i = 0; i < placeholderTexts.length; i++) {
    const placeholderText = placeholderTexts[i]
    const filterDropdownProxy = await (async () => {
      const jsHandle = (await page.evaluateHandle((placeholderText) => {
        const filterBar = document.querySelector('.page-jobs-main .filter-condition-inner')
        const dropdownEntry = filterBar.__vue__.$children.find(it => it.placeholder === placeholderText)
        return dropdownEntry.$el
      }, placeholderText)).asElement();
      return jsHandle
    })()
    if (!filterDropdownProxy) {
      continue
    }

    const currentFilterConditions = conditionArr[i];
    const filterDropdownCssList = await filterDropdownProxy.evaluate(el => Array.from(el.classList));
    if (!filterDropdownCssList.includes('is-select') && !currentFilterConditions.length) {
      continue
    } else {
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
          for(let i = 0; i < activeOptionValues.length; i++) {
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
        for(let j = 0; j < conditionToCheck.length; j++) {
          let optionValue
          if (placeholderText === '公司行业') {
            optionValue = industryFilterConditionCodeToIndexMap[conditionToCheck[j]]
          } else {
            optionValue = conditionToCheck[j]
          }
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

const jobSource = [
  {
    name: 'recommendJob'
  },
  {
    name: 'userSetExpectJob'
  },
  {
    name: 'searchJob',
    keyword: 'HRBP'
  },
  {
    name: 'searchJob',
    keyword: '招聘'
  }
]

async function toRecommendPage (hooks) {
  let userInfoPromise = page.waitForResponse((response) => {
      if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
        return true
      }
      return false
    }).then((res) => {
      return res.json()
    })
  await Promise.all([
    page.goto(recommendJobPageUrl, { timeout: 120 * 1000 }),
    page.waitForNavigation(),
  ])
  if (
    page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
    page.url().startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    throw new Error("ACCESS_IS_DENIED")
  }
  hooks.pageLoaded?.call()

  let userInfoResponse = await userInfoPromise
  await hooks.userInfoResponse?.promise(userInfoResponse)
  if (userInfoResponse.code !== 0) {
    autoStartChatEventBus.emit('LOGIN_STATUS_INVALID', {
      userInfoResponse
    })
    writeStorageFile('boss-cookies.json', [])
    throw new Error("LOGIN_STATUS_INVALID")
  } else {
    await storeStorage(page).catch(() => void 0)
  }

  // check set security question tip modal
  let setSecurityQuestionTipModelProxy = await page.$('.dialog-wrap.dialog-account-safe')
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

  const RECOMMEND_JOB_ENTRY_SELECTOR = `.c-expect-select a[ka="jobs_recommend_tab_click"]`
  const USER_SET_EXPECT_JOB_ENTRIES_SELECTOR = `.c-expect-select .expect-list .expect-item`
  const SEARCH_BOX_SELECTOR = `.c-search-input .search-input-box`

  const computedSourceList = []
  for (const source of jobSource) {
    switch (source.name) {
      case 'recommendJob': {
        computedSourceList.push({
          sourceName: source.name,
          selector: RECOMMEND_JOB_ENTRY_SELECTOR,
          async getIsCurrentActiveSource () {
            return await page.evaluate(
              ({ RECOMMEND_JOB_ENTRY_SELECTOR }) => {
                return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR).classList.contains('active')
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
      case 'userSetExpectJob': {
        await page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        const allExpectJobEntryHandles = await page.$$(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        allExpectJobEntryHandles.forEach((it, index) => {
          computedSourceList.push({
            sourceName: source.name,
            selector: `${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`,
            async getIsCurrentActiveSource () {
              return await page.evaluate(
                ({
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }) => {
                  return document.querySelector(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`).classList.contains('active')
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
      case 'searchJob': {
        computedSourceList.push({
          sourceName: source.name,
          async getIsCurrentActiveSource () {
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
  afterPageLoad: while (true) {
    let expectJobList
    iterateFilterCondition: for (
      const filterCondition of combineFiltersWithConstraintsGenerator(
        anyCombineRecommendJobFilter
      )
    ) {
      findInCurrentFilterCondition: while(true) {
        await sleepWithRandomDelay(2500)

        await Promise.all([
          Promise.race([
            page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR),
            page.waitForSelector(RECOMMEND_JOB_ENTRY_SELECTOR),
          ]),
          Promise.race([
            page.waitForSelector(".job-list-container .rec-job-list"),
            page.waitForSelector(".recommend-result-job .job-empty-wrapper")
          ])
        ])
        // await page.click(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        await sleep(3000)
        let onPageCurrentSourceIndex = -1
        for (let i=0; i < computedSourceList.length; i++) {
          const computedSource = computedSourceList[i]
          if (await computedSource.getIsCurrentActiveSource()) {
            onPageCurrentSourceIndex = i
            break
          }
        }

        if (
          isSkipEmptyConditionForCombineRecommendJobFilter &&
          Object.keys(filterCondition).length &&
          Object.keys(filterCondition).every(k => !filterCondition[k]?.length)
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
        }
        await sleepWithRandomDelay(1500)
        await setFilterCondition(filterCondition)
        await sleep(1500) // TODO: accurately check if job list request sent and response received after set condition
        await page.waitForFunction(() => {
          return !document.querySelector('.job-recommend-result .job-rec-loading')
        })
        try {
          const { targetJobIndex, targetJobData } = await new Promise(async (resolve, reject) => {
            try {
              let requestNextPagePromiseWithResolver = null
              page.on(
                'request',
                function reqHandler (request) {
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
                      function resHandler (response) {
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
              let  recommendJobListElProxy
              try {
                recommendJobListElProxy= await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
              } catch {}
              if (!recommendJobListElProxy){
                await hooks.encounterEmptyRecommendJobList?.promise({
                  pageQuery: await page.evaluate(() => new URL(location.href).searchParams.toString())
                })
                throw new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION')
              }
              let jobListData = []
              async function updateJobListData () {
                jobListData = await page.evaluate(`document.querySelector('.page-jobs-main')?.__vue__?.jobList`)
                // due to city can get from list immediately
                // so just set those job which city is not suit to blockJobNotSuit
                // to skip view detail

                // skip invalid salaryData (兼职、日结、实习 etc)
                jobListData.forEach(it => {
                  const salaryData = parseSalary(it.salaryDesc)
                  if (!salaryData.high || !salaryData.low) {
                    blockJobNotSuit.add(it.encryptJobId)
                  }
                })
                if (
                  (
                    expectCityNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
                    Array.isArray(expectCityList) &&
                    expectCityList.length
                  ) ||
                  (
                    expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
                    Array.isArray(expectWorkExpList) &&
                    expectWorkExpList.length
                  ) ||
                  (
                    strategyScopeOptionWhenMarkSalaryNotMatch === MarkAsNotSuitOp.NO_OP &&
                    isSalaryFilterEnabled
                  )
                ) {
                  console.log(`add job city not suit into blockJobNotSuit set`)
                  for (const it of jobListData) {
                    if (!expectCityList.includes(it.cityName)) {
                      blockJobNotSuit.add(it.encryptJobId)
                    }
                  }
                }
              }
              await updateJobListData()

              let hasReachLastPage = false
              let targetJobIndex = -1
              let targetJobData, selectedJobData // they show be same; one is from list, another is from detail
              function checkIfSalarySuit(salaryDesc) {
                const salaryData = parseSalary(salaryDesc)
                if (expectSalaryCalculateWay === SalaryCalculateWay.MONTH_SALARY) {
                  if (expectSalaryHigh && salaryData.high > expectSalaryHigh) {
                    return false
                  }
                  if (expectSalaryLow && salaryData.low < expectSalaryLow) {
                    return false
                  }
                } else if (expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE) {
                  const salaryDataMonth = salaryData.month || 12
                  if (expectSalaryHigh && (salaryData.high * salaryDataMonth) / 10 > expectSalaryHigh) {
                    return false
                  }
                  if (expectSalaryLow && (salaryData.low * salaryDataMonth) / 10 < expectSalaryLow) {
                    return false
                  }
                }
                return true
              }
              function getTempTargetJobIndexToCheckDetail () {
                return jobListData.findIndex(it => {
                  return !blockBossNotNewChat.has(it.encryptBossId) &&
                    !blockBossNotActive.has(it.encryptBossId) &&
                    !blockJobNotSuit.has(it.encryptJobId) &&
                    (
                      (
                        enableCompanyAllowList ?
                          [...expectCompanySet].find(
                            name => it.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                          )
                          :
                          true
                      ) || (
                        // enter job detail to mark as not suit for city filter
                        (
                          Array.isArray(expectCityList) &&
                          expectCityList.length &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectCityNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkJobCityNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !expectCityList.includes(it.cityName) : false
                      ) || (
                        // enter job detail to mark as not suit for work exp filter
                        (
                          Array.isArray(expectWorkExpList) &&
                          expectWorkExpList.length &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectWorkExpNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkJobWorkExpNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !expectWorkExpList.includes(it.jobExperience) : false
                      ) || (
                        // enter job detail to mark as not suit for salary filter
                        (
                          isSalaryFilterEnabled &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectSalaryNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkSalaryNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !checkIfSalarySuit(it.salaryDesc) : false
                      )
                    )
                })
              }
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                // when disable company allow list, we will believe that the first one in the list is your expect job.
                let tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                while (tempTargetJobIndexToCheckDetail < 0 && !hasReachLastPage) {
                  // fetch new
                  const recommendJobListElBBox = await recommendJobListElProxy.boundingBox()
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
                    await page.mouse.wheel({deltaY: increase});
                    await sleep(100)
                    await requestNextPagePromiseWithResolver?.promise
                    hasReachLastPage = await page.evaluate(`
                      !(document.querySelector('.page-jobs-main')?.__vue__?.hasMore)
                    `)
                    if (hasReachLastPage) {
                      console.log(`Arrive the terminal of the job list.`)
                    }
                  }
                  requestNextPagePromiseWithResolver = null

                  await sleep(5000)
                  await updateJobListData()
                  tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                }

                if (tempTargetJobIndexToCheckDetail < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }

                //#region here to check detail
                if (tempTargetJobIndexToCheckDetail >= 0) {
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
                    const recommendJobItemList = await recommendJobListElProxy.$$('ul.rec-job-list li.job-card-box')
                    const targetJobElProxy = recommendJobItemList[tempTargetJobIndexToCheckDetail]
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
                  targetJobData = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
                  selectedJobData = await page.evaluate('document.querySelector(".page-jobs-main").__vue__.currentJob')
                  // save the job detail info
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)

                  //#region collect not suit reasons
                  const notSuitReasonIdToStrategyMap = {}
                  const notSuitConditionHandleMap = {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                            }
                          )
                        } catch {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                            }
                          )
                        } catch {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                            }
                          )
                        } catch {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                            }
                          )
                        } catch {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
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
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
                            }
                          )
                        } catch {
                        }
                      }
                    }
                  }

                  //#region
                  // null
                  // 刚刚活跃 // 今日活跃 // 昨日活跃 // 3日内活跃 // 本周活跃 // 2周内活跃
                  // 本月活跃 // 2月内活跃 // 3月内活跃 // 4月内活跃 // 5月内活跃 // 近半年活跃 // 半年前活跃
                  //#endregion
                  const indexOfActiveText = activeDescList.indexOf(targetJobData.bossInfo.activeTimeDesc)
                  if (
                    markAsNotActiveSelectedTimeRange > 0 &&
                    indexOfActiveText > 0 && indexOfActiveText <= markAsNotActiveSelectedTimeRange
                  ) {
                    // click prevent recommend button
                    notSuitReasonIdToStrategyMap.active = jobNotActiveStrategy
                  }
                  if (
                    (Array.isArray(expectCityList) && expectCityList.length) && !expectCityList.includes(selectedJobData.cityName)
                  ) {
                    notSuitReasonIdToStrategyMap.city = expectCityNotMatchStrategy
                  }
                  if (
                    (Array.isArray(expectWorkExpList) && expectWorkExpList.length) && !expectWorkExpList.includes(selectedJobData.jobExperience)
                  ) {
                    notSuitReasonIdToStrategyMap.workExp = expectWorkExpNotMatchStrategy
                  }
                  if (
                    !testIfJobTitleOrDescriptionSuit(targetJobData.jobInfo, jobDetailRegExpMatchLogic)
                  ) {
                    notSuitReasonIdToStrategyMap.jobDetail = jobNotMatchStrategy
                  }
                  if (
                    !checkIfSalarySuit(selectedJobData.salaryDesc)
                  ) {
                    notSuitReasonIdToStrategyMap.salary = expectSalaryNotMatchStrategy
                  }
                  // #endregion
                  console.log('not suit reason and related strategy: ', notSuitReasonIdToStrategyMap)

                  // #region execute mark logic
                  // 1. find the one mark on Boss
                  const markOnBossCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS)
                  if (markOnBossCondition) {
                    await notSuitConditionHandleMap[markOnBossCondition]()
                    continue continueFind
                  }
                  // 2. if there is no condition to mark Boss, then find the one mark on local db
                  const markOnLocalDbCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL)
                  if (markOnLocalDbCondition) {
                    await notSuitConditionHandleMap[markOnLocalDbCondition]()
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
            } catch(err) {
              reject(err)
            }
          })
          await sleepWithRandomDelay(1000)
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')

          await hooks.newChatWillStartup?.promise(targetJobData)
          const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
          await sleep(500)
          //#region click the chat button
          await startChatButtonProxy.click()

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

          if (res.code !== 0) {
            // startup chat error, may the chance of today has used out
            if (res.zpData.bizCode === 1 && res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 && res.zpData.bizData?.chatRemindDialog?.content === `今日沟通人数已达上限，请明天再试`) {
              await storeStorage(page).catch(() => void 0)
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
            } else {
              console.error(res)
              throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
            }
          } else {
            await hooks.newChatStartup?.promise(targetJobData, { chatStartupFrom: ChatStartupFrom.AutoFromRecommendList })
            blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)

            await storeStorage(page).catch(() => void 0)
            await sleepWithRandomDelay(1500)
            const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
            await closeDialogButtonProxy.click()
            await sleepWithRandomDelay(2000)
          }
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
              case 'STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR': {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
              default: {
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
      hooks.noPositionFoundForCurrentJob?.call()
      hooks.noPositionFoundAfterTraverseAllJob?.call()
      await sleep((20 + 30 * Math.random()) * 1000)
      await Promise.all([
        page.goto(`https://www.zhipin.com/web/geek/jobs`),
        page.waitForNavigation()
      ])
      currentSourceIndex = 0
    } else {
      hooks.noPositionFoundForCurrentJob?.call()
      await sleep((10 + 15 * Math.random()) * 1000)
      currentSourceIndex += 1
    }
  }
}

export async function mainLoop (hooks) {
  if (!puppeteer) {
    await initPuppeteer()
  }
  try {
    browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      }
    })
    hooks.puppeteerLaunched?.call()
    page = (await browser.pages())[0]
    //set cookies
    hooks.cookieWillSet?.call(bossCookies)
    for(let i = 0; i < bossCookies.length; i++){
      await page.setCookie(bossCookies[i]);
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
    await page.bringToFront()
    await hooks.mainFlowWillLaunch?.callAsync({
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

export async function closeBrowserWindow () {
  browser?.close()
  const browserProcess = browser?.process()
  if (browserProcess) {
    process.kill(browserProcess.pid)
  }
  browser = null
  page = null
}

async function storeStorage (page) {
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
