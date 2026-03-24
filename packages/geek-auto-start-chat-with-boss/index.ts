export * from './runtime-file-utils'
export * from './constant'
export * from './combineCalculator'
export * from './sage-time'
export * from './cityGroup'

import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils'

import { EventEmitter } from 'node:events'
import { readStorageFile, writeStorageFile, ensureConfigFileExist, ensureStorageFileExist, readConfigFile } from './runtime-file-utils'
import {
  calculateTotalCombinations,
  combineFiltersWithConstraintsGenerator,
  checkAnyCombineBossRecommendFilterHasCondition,
  formatStaticCombineFilters,
} from './combineCalculator'
import jobFilterConditions from './internal-config/job-filter-conditions-20241002.json'
import rawIndustryFilterExemption from './internal-config/job-filter-industry-filter-exemption-20241002.json'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/entity/ChatStartupLog'
import {
  MarkAsNotSuitReason,
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch,
  SalaryCalculateWay,
  JobDetailRegExpMatchLogic,
  JobSource,
  CombineRecommendJobFilterType
} from '@geekgeekrun/sqlite-plugin/enums'
import {
  activeDescList,
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
  SEARCH_BOX_SELECTOR,
} from './constant'
import { parseSalary } from "@geekgeekrun/sqlite-plugin/utils/parser"
import { waitForSageTimeOrJustContinue } from './sage-time'
import cityGroupData from './cityGroup'
import { hasIntersection, type Interval } from '@geekgeekrun/utils/number';

export { sleep, sleepWithRandomDelay }

const flattedCityList = []
;(cityGroupData?.zpData?.cityGroup ?? []).forEach(it => {
  const firstChar = it.firstChar
  it.cityList.forEach(city => {
    flattedCityList.push({
      ...city,
      firstChar
    })
  })
})

const jobFilterConditionsMapByCode: any = {}
Object.values(jobFilterConditions).forEach((arr: any[]) => {
  arr.forEach(option => {
    jobFilterConditionsMapByCode[option.code] = option
  })
})

let industryFilterCursorIndex = 0;
const industryFilterExemption = JSON.parse(JSON.stringify(rawIndustryFilterExemption))
const industryFilterConditionsMapByIndex: any = {}
const industryFilterConditionsMapByCode: any = {}
const industryFilterConditionCodeToIndexMap: any = {}
industryFilterExemption.forEach((item: any) => {
  if (!Array.isArray(item.subLevelModelList)) {
    return
  }
  item.subLevelModelList.forEach((option: any) => {
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

let puppeteer: any
let StealthPlugin: any
let LaodengPlugin: any
let AnonymizeUaPlugin: any

const commonJobConditionConfig = readConfigFile('common-job-condition-config.json')
const fieldsForUseCommonConfig = readConfigFile('boss.json').fieldsForUseCommonConfig ?? {}

const targetCompanyList = (
  !fieldsForUseCommonConfig.expectCompanies ?
    readConfigFile('target-company-list.json')
    :
    commonJobConditionConfig.expectCompanies
).filter((it: string) => !!it.trim());
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
  expectWorkExpListSet.has('应届生') ||
  expectWorkExpListSet.has('在校生')
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
    typeof n !== 'number' || isNaN(n) || n >= activeDescList.length || n < 0
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
  ].map((it: any) => Boolean(it?.trim())).every((it: boolean) => !it)
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

let browser: any = null
let page: any = null

const blockBossNotNewChat = new Set<string>()
const blockBossNotActive = new Set<string>()
const blockJobNotSuit = new Set<string>()

export async function initPuppeteer () {
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
  // 确保 LaodengPlugin 是一个函数
  if (typeof LaodengPlugin !== 'function') {
    // 尝试从默认导出中获取函数
    LaodengPlugin = LaodengPlugin.default || LaodengPlugin
  }
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

async function setDomainLocalStorage(browser: any, domain: string, localStorage: any) {
  const page = await browser.newPage()
  await page.goto(domain)
  for (const key in localStorage) {
    await page.evaluate((key, value) => {
      localStorage.setItem(key, value)
    }, key, localStorage[key])
  }
  await page.close()
}

async function markJobAsNotSuitInRecommendPage (reasonCode: any) {
  const result: any = {}
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

export function testIfJobTitleOrDescriptionSuit (jobInfo: any, matchLogic: any) {
  let isJobNameSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobNameRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobNameRegExpStr, 'im')
      isJobNameSuit = regExp.test(jobInfo.jobName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobTypeSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobTypeRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobTypeRegExpStr, 'im')
      isJobTypeSuit = regExp.test(jobInfo.positionName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobDescSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobDescRegExpStr?.trim()) {
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

async function setFilterCondition (selectedFilters: any) {
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
    console.log(`${text}：`, condition.length === 0 ? '不限' : condition.map((code: any) => {
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
        if (placeholderText === '城市') {
          return document.querySelector('.page-jobs-main .filter-condition-inner [ka="switch_city_dialog_open"]')
        }
        else {
          const filterBar = document.querySelector('.page-jobs-main .filter-condition-inner')
          const dropdownEntry = (filterBar as any)?.__vue__?.$children.find((it: any) => it.placeholder === placeholderText)
          return dropdownEntry?.$el
        }
      }, placeholderText))?.asElement();
      return jsHandle
    })()
    if (!filterDropdownProxy) {
      continue
    }

    const currentFilterConditions = conditionArr[i];
    const filterDropdownCssList = await filterDropdownProxy.evaluate((el: any) => Array.from(el.classList));
    if (placeholderText === '城市') {
      const onPageSelectedCity = filterDropdownCssList.includes('active') ? (await filterDropdownProxy.evaluate((el: any) => el.textContent.trim())) : null
      if (!onPageSelectedCity && !currentFilterConditions.length) {
        continue
      } else if (onPageSelectedCity === (currentFilterConditions[0] ?? null)) {
        continue
      } else {
        if (!currentFilterConditions.length) {
          const clearButtonHandle = await page.$(`.page-jobs-main .filter-condition-inner [ka="empty-filter"]`)
          await clearButtonHandle.click()
        }
        else {
          await filterDropdownProxy?.click()
          await page.waitForFunction(() => {
            const dialogEl = document.querySelector('.city-select-dialog')
            return dialogEl && window.getComputedStyle(dialogEl).display !== 'none'
          })
          const citySelectWrapperProxy = await page.waitForSelector('.city-select-wrapper')
          let targetCityElJsHandle = (await page.evaluateHandle((cityName: any) => {
            const targetCityEl = Array.from(document.querySelectorAll('.city-select-dialog .city-select-wrapper ul.city-list-hot li')).find((it: any) => it.textContent.trim() === cityName) ?? null
            return targetCityEl
          }, currentFilterConditions[0]))?.asElement()
          if (!targetCityElJsHandle) {
            const targetCityItem = flattedCityList.find((it: any) => it.name === currentFilterConditions[0])
            if (!targetCityItem) {
              continue
            }
            const firstChar = targetCityItem.firstChar
            const targetCityCharListEntryHandle = await page.$(`xpath///*[contains(@class, "city-select-dialog")]//*[contains(@class, "city-select-wrapper")]//ul[contains(@class, "city-char-list")]//li[contains(text(), '${firstChar.toUpperCase()}')]`)
            await targetCityCharListEntryHandle.click()
            targetCityElJsHandle = (await page.evaluateHandle((cityName: any) => {
              const targetCityEl = Array.from(document.querySelectorAll('.city-select-dialog .city-select-wrapper .list-select-list a')).find((it: any) => it.textContent.trim() === cityName) ?? null
              return targetCityEl
            }, currentFilterConditions[0]))?.asElement()
          }
          if (!targetCityElJsHandle) {
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
            const buxianOptionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${0}"]`)
            await buxianOptionElProxy.click()
          }
        } else {
          const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
          const activeOptionValues = (await Promise.all(
            activeOptionElAtCurrentFilterProxyList.map(elProxy => {
              return elProxy.evaluate((el: any) => {
                return el.getAttribute('ka')
              })
            })
          )).map((it: string) => it.replace(optionKaPrefix, '')).map(Number)
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
          const conditionToCheck = currentFilterConditions.filter((it: any) => {
            if (placeholderText === '公司行业') {
              return !activeOptionValues.map((value: any) => industryFilterConditionsMapByIndex[value].code).includes(it);
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
          const navBarLogoElProxy = await page.$(`[ka="header-home-logo"]`)
          if (navBarLogoElProxy) {
            const navBarLogoElBBox = await navBarLogoElProxy.boundingBox()
            await page.mouse.move(
              navBarLogoElBBox.x + navBarLogoElBBox.width / 2,
              navBarLogoElBBox.y + navBarLogoElBBox.height / 2,
            )
          }
        }
        await sleepWithRandomDelay(500)
      }
    }
  }
}

async function toRecommendPage (hooks: any) {
  let userInfoPromise = page.waitForResponse((response: any) => {
      if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
        return true
      }
      return false
    }, { timeout: 120 * 1000 }).then((res: any) => {
      return res.json()
    })
  page.goto(recommendJobPageUrl, { timeout: 1 * 1000 }).catch(e => { void e })
  await sleep(3000)
  await page.waitForFunction(() => {
    return document.readyState === 'complete'
  }, { timeout: 120 * 1000 })
  if (
    page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
    page.url().startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    throw new Error("ACCESS_IS_DENIED")
  }

  await page.waitForFunction(({ recommendJobPageUrl }: any) => {
    return location.href.startsWith(recommendJobPageUrl) && document.readyState === 'complete'
  }, undefined, { recommendJobPageUrl })

  hooks.pageLoaded?.call()

  let userInfoResponse = await userInfoPromise
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
          selector: RECOMMEND_JOB_ENTRY_SELECTOR,
          async getIsCurrentActiveSource () {
            return await page.evaluate(
              ({ RECOMMEND_JOB_ENTRY_SELECTOR }: any) => {
                return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR).classList.contains('active')
              }, {
                RECOMMEND_JOB_ENTRY_SELECTOR
              }
            )
          },
          async setToActiveSource() {
            const expectJobTabHandler = await page.$(RECOMMEND_JOB_ENTRY_SELECTOR)
            await expectJobTabHandler.click()
          }
        })
        continue
      }
      case 'expect': {
        await page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        const allExpectJobEntryHandles = await page.$$(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        allExpectJobEntryHandles.forEach((it: any, index: number) => {
          computedSourceList.push({
            type: source.type,
            selector: `${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`,
            async getIsCurrentActiveSource () {
              return await page.evaluate(
                ({
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }: any) => {
                  return document.querySelector(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`).classList.contains('active')
                }, {
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }
              )
            },
            async setToActiveSource() {
              const expectJobTabHandler = await page.$(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`)
              await expectJobTabHandler.click()
            }
          })
        })
        break
      }
      case 'search': {
        computedSourceList.push({
          type: source.type,
          async getIsCurrentActiveSource () {
            const elHandle = await page.$(`.page-jobs-main`)
            const currentKeyWord = await elHandle?.evaluate((el: any) => {
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
            let currentValue = await inputHandle.evaluate((el: any) => el.value)
            while (currentValue) {
              await inputHandle.press('Backspace')
              currentValue = await inputHandle.evaluate((el: any) => el.value)
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
    let setSecurityQuestionTipModelProxy
    try {
      setSecurityQuestionTipModelProxy = await page.waitForSelector('.dialog-wrap.dialog-account-safe', { timeout: 3 * 1000 })
    }
    catch(err) {
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
      filterConditionIndex++
      console.log(`current filter condition index to apply: ${filterConditionIndex}`, JSON.stringify(filterCondition))
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
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE && filterCondition === null
          )
          ||
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.ANY_COMBINE &&
            isSkipEmptyConditionForCombineRecommendJobFilter &&
            Object.keys(filterCondition).length &&
            Object.keys(filterCondition).every((k: any) => !filterCondition[k]?.length)
          )
        ) {
          sleep(4000)
          continue iterateFilterCondition
        }
        expectJobList = await page.evaluate(`document.querySelector('.c-expect-select')?.__vue__?.expectList`)
        if (onPageCurrentSourceIndex === currentSourceIndex) {
        } else {
          await computedSourceList[currentSourceIndex].setToActiveSource()
          await page.waitForResponse(
            (response: any) => {
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
        await sleepWithRandomDelay(1500)
        await setFilterCondition(filterCondition)
        await sleep(1500)
        await page.waitForFunction(() => {
          return !document.querySelector('.job-recommend-result .job-rec-loading')
        })
        try {
          const { targetJobIndex, targetJobData } = await new Promise<{ targetJobIndex: number, targetJobData: any }>(async (resolve, reject) => {
            try {
              let requestNextPagePromiseWithResolver = null
              page.on(
                'request',
                function reqHandler (request: any) {
                  if (
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
                  ) {
                    requestNextPagePromiseWithResolver = (() => {
                      const o: any = {}
                      o.promise = new Promise((resolve, reject) => {
                        o.resolve = resolve
                        o.reject = reject
                      })
                      return o
                    })()
                    page.off('request', reqHandler)

                    page.on(
                      'response',
                      function resHandler (response: any) {
                        if (response.request() === request) {
                          requestNextPagePromiseWithResolver?.resolve()
                          page.off('response', resHandler)
                        }
                      }
                    )
                  }
                }
              )
              let recommendJobListElProxy
              try {
                recommendJobListElProxy= await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
              } catch {}
              if (!recommendJobListElProxy){
                await hooks.encounterEmptyRecommendJobList?.promise({
                  pageQuery: await page.evaluate(() => new URL(location.href).searchParams.toString())
                })
                throw new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION')
              }
              let jobListData: any[] = []
              async function updateJobListData () {
                jobListData = await page.evaluate(`document.querySelector('.page-jobs-main')?.__vue__?.jobList`)
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
              let targetJobData: any, selectedJobData: any
              function checkIfSalarySuit(salaryDesc: string) {
                const salaryData = parseSalary(salaryDesc)
                if (expectSalaryCalculateWay === SalaryCalculateWay.MONTH_SALARY) {
                  let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
                  if (ourSalaryInterval.every((it: any) => !isNaN(parseFloat(it)))) {
                    ourSalaryInterval = ourSalaryInterval.sort((a: number, b: number) => a - b)
                  }
                  const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null] as Interval
                  return hasIntersection(theirSalaryInterval, ourSalaryInterval as Interval)
                }
                else if (expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE) {
                  const salaryDataMonth = salaryData.month || 12
                  let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
                  if (ourSalaryInterval.every((it: any) => !isNaN(parseFloat(it)))) {
                    ourSalaryInterval = ourSalaryInterval.sort((a: number, b: number) => a - b)
                  }
                  const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null].map(
                    (it: any) =>
                      it === null ? null : (it * salaryDataMonth / 10)
                  ) as Interval
                  return hasIntersection(theirSalaryInterval, ourSalaryInterval as Interval)
                }
                return true
              }
              function getTempTargetJobIndexToCheckDetail () {
                return jobListData.findIndex((it: any) => {
                  return !blockBossNotNewChat.has(it.encryptBossId) &&
                    !blockBossNotActive.has(it.encryptBossId) &&
                    !blockJobNotSuit.has(it.encryptJobId) &&
                    (
                      (
                        enableCompanyAllowList ?
                          [...expectCompanySet].find(
                            (name: string) => it.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                          )
                          :
                          true
                      ) || (
                        (Array.isArray(expectCityList) &&
                        expectCityList.length &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectCityNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkJobCityNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !expectCityList.includes(it.cityName) : false
                      ) || (
                        (Array.isArray(expectWorkExpList) &&
                        expectWorkExpList.length &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectWorkExpNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkJobWorkExpNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !expectWorkExpList.includes(it.jobExperience) : false
                      ) || (
                        (isSalaryFilterEnabled &&
                        [
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                          MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                        ].includes(expectSalaryNotMatchStrategy) &&
                        strategyScopeOptionWhenMarkSalaryNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                      ) ? !checkIfSalarySuit(it.salaryDesc) : false
                      ) || (
                        !!blockCompanyNameRegExp &&
                        blockCompanyNameRegExp.test(it.brandName?.toLowerCase?.() ?? '') &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(blockCompanyNameRegMatchStrategy)
                      )
                    )
                })
              }
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                let tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                while (tempTargetJobIndexToCheckDetail < 0 && !hasReachLastPage) {
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
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobListPageFetched',
                    hooks
                  })
                  await sleep(5000)
                  await updateJobListData()
                  tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                }

                if (tempTargetJobIndexToCheckDetail < 0 && hasReachLastPage) {
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }

                if (tempTargetJobIndexToCheckDetail >= 0) {
                  await page.evaluate(`
                    targetEl = document.querySelector("ul.rec-job-list").children[${tempTargetJobIndexToCheckDetail}]
                    targetEl.scrollIntoView({
                      behavior: 'smooth',
                      block: ${Math.random() > 0.5 ? "'center'" : "'end'"}
                    })
                  `)

                  await sleepWithRandomDelay(200)

                  if (tempTargetJobIndexToCheckDetail === 0) {
                  } else {
                    const recommendJobItemList = await recommendJobListElProxy.$$('ul.rec-job-list li.job-card-box')
                    const targetJobElProxy = recommendJobItemList[tempTargetJobIndexToCheckDetail]
                    await sleep(500)
                    await targetJobElProxy.click()
                    await page.waitForResponse(
                      (response: any) => {
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
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobDetailFetched',
                    hooks
                  })
                  targetJobData = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
                  selectedJobData = await page.evaluate('document.querySelector(".page-jobs-main").__vue__.currentJob')
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)

                  const notSuitReasonIdToStrategyMap: any = {}
                  const notSuitConditionHandleMap: any = {
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
                        } catch {}
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
                        } catch(err) {
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
                        } catch {}
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
                        } catch(err) {
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
                        } catch {}
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
                        } catch(err) {
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
                        } catch {}
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
                        } catch(err) {
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
                        } catch {}
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
                        } catch(err) {
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
                        } catch {}
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
                        } catch(err) {
                          console.log(`mark job salary not suit failed`, err)
                        }
                      }
                    }
                  }

                  if (
                    !!blockCompanyNameRegExp && blockCompanyNameRegExp.test(selectedJobData.brandName ?? '')
                  ) {
                    notSuitReasonIdToStrategyMap.companyName = blockCompanyNameRegMatchStrategy
                  }
                  const indexOfActiveText = activeDescList.indexOf(targetJobData.bossInfo.activeTimeDesc)
                  if (
                    markAsNotActiveSelectedTimeRange > 0 &&
                    indexOfActiveText > 0 && indexOfActiveText <= markAsNotActiveSelectedTimeRange
                  ) {
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
                  console.log('not suit reason and related strategy: ', notSuitReasonIdToStrategyMap)

                  const markOnBossCondition = Object.keys(notSuitReasonIdToStrategyMap).find((k: any) => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS)
                  if (markOnBossCondition) {
                    await notSuitConditionHandleMap[markOnBossCondition]()
                    continue continueFind
                  }
                  const markOnLocalDbCondition = Object.keys(notSuitReasonIdToStrategyMap).find((k: any) => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL)
                  if (markOnLocalDbCondition) {
                    await notSuitConditionHandleMap[markOnLocalDbCondition]()
                    continue continueFind
                  }
                  const noOpCondition = Object.keys(notSuitReasonIdToStrategyMap).find((k: any) => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.NO_OP)
                  if (noOpCondition) {
                    await notSuitConditionHandleMap[noOpCondition]()
                    continue continueFind
                  }
                  if (
                    enableCompanyAllowList && ![...expectCompanySet].find(
                      (name: string) => selectedJobData.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                    ) ||
                    [...blockJobNotSuit,
                    ...blockBossNotActive
                    ].includes(targetJobData.jobInfo.encryptId)
                  ) {
                    continue continueFind
                  }
                  const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
                  if (startChatButtonInnerHTML !== '立即沟通') {
                    blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
                    continue continueFind
                  }
                  targetJobIndex = tempTargetJobIndexToCheckDetail
                }

                if (targetJobIndex < 0 && hasReachLastPage) {
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
          await waitForSageTimeOrJustContinue({
            tag: 'beforeJobChatStartup',
            hooks
          })
          await sleepWithRandomDelay(1000)
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')

          await hooks.newChatWillStartup?.promise(targetJobData)
          const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
          await sleep(500)
          await startChatButtonProxy.click()

          const waitAddFriendResponse = async () => {
            const addFriendResponse = await page.waitForResponse(
              (response: any) => {
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
          const waitAndHandleChatSuccess = async () => {
            await hooks.newChatStartup?.promise(
              targetJobData,
              {
                chatStartupFrom: ChatStartupFrom.AutoFromRecommendList,
                jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
              }
            )
            blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)

            await storeStorage(page).catch(() => void 0)
            await sleepWithRandomDelay(1500)
            const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
            await closeDialogButtonProxy.click()
            await sleepWithRandomDelay(2000)
          }
          const handleAddFriendResponse = async (res: any) => {
            if (res.code === 0) {
              await waitAndHandleChatSuccess()
            }
            else if (
              res.zpData.bizCode === 1 &&
              res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 &&
              /剩\d+次沟通机会/.test(res.zpData.bizData?.chatRemindDialog?.content)
            ) {
              await waitForSageTimeOrJustContinue({
                tag: 'beforeJobChatStartupAfterTwiceConfirm',
                hooks
              })
              const confirmButton = await page.waitForSelector('.chat-block-dialog .chat-block-footer .sure-btn')
              await confirmButton.click()
              const nextRes = await waitAddFriendResponse()
              await handleAddFriendResponse(nextRes)
            }
            else if (
              res.zpData.bizCode === 1 &&
              /猎头/.test(res.zpData.bizData?.chatRemindDialog?.content)
            ) {
              await waitForSageTimeOrJustContinue({
                tag: 'beforeJobChatStartupAfterTwiceConfirm',
                hooks
              })
              const confirmButton = await page.waitForSelector(`xpath///*[contains(@class, "chat-block-dialog")]//*[contains(@class, "chat-block-footer")]//*[contains(text(), "继续")]`)
              await confirmButton.click()
              const nextRes = await waitAddFriendResponse()
              await handleAddFriendResponse(nextRes)
            }
            else if (
              res.zpData.bizCode === 1 &&
              res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 && 
              (
                res.zpData.bizData?.chatRemindDialog?.content === `今日沟通人数已达上限，请明天再试` ||
                /明天再来/.test(res.zpData.bizData?.chatRemindDialog?.content)
              )
            ) {
              await storeStorage(page).catch(() => void 0)
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
            }
            else {
              console.error(
                JSON.stringify(res, null, 2)
              )
              throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
            }
          }
          const res = await waitAddFriendResponse()
          await handleAddFriendResponse(res)
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

async function storeStorage(page: any) {
  const [cookies, localStorage] = await Promise.all([
    page.cookies(),
    page.evaluate(() => {
      return JSON.stringify(window.localStorage)
    }).then(res => JSON.parse(res))
  ])
  return Promise.all([
    writeStorageFile('boss-cookies.json', cookies),
    writeStorageFile('boss-local-storage.json', localStorage)
  ])
}

export async function mainLoop(hooks: any): Promise<void> {
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
    hooks.puppeteerLaunched?.call(browser)
    page = (await browser.pages())[0]
    hooks.pageGotten?.call(page)
    
    // 设置cookies和localStorage
    const bossCookies = readStorageFile('boss-cookies.json')
    const bossLocalStorage = readStorageFile('boss-local-storage.json')
    await hooks.cookieWillSet?.promise(bossCookies)
    for(let i = 0; i < bossCookies.length; i++){
      await page.setCookie(bossCookies[i]);
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
    await page.bringToFront()
    
    // 调用mainFlowWillLaunch hook
    await hooks.mainFlowWillLaunch?.promise({
      jobNotMatchStrategy,
      jobNotActiveStrategy,
      expectCityNotMatchStrategy,
      blockJobNotSuit,
      blockBossNotActive,
      blockBossNotNewChat
    })
    
    // 跳转到推荐页面
    await toRecommendPage(hooks)
  } catch (err) {
    closeBrowserWindow()
    throw err
  }
}

export function closeBrowserWindow(): void {
  browser?.close()
  const browserProcess = browser?.process()
  if (browserProcess) {
    try {
      process.kill(browserProcess.pid)
    } catch {}
  }
  browser = null
  page = null
}
