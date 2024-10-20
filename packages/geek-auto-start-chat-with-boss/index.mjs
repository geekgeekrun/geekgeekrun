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
import { calculateTotalCombinations, combineFiltersWithConstraintsGenerator } from './combineCalculator.mjs'
import { default as jobFilterConditions } from './internal-config/job-filter-conditions-20241002.json'
import { default as rawIndustryFilterExemption } from './internal-config/job-filter-industry-filter-exemption-20241002.json'
import { ChatStartupFrom } from '@geekgeekrun/sqlite-plugin/dist/entity/ChatStartupLog'
import { MarkAsNotSuitReason } from '@geekgeekrun/sqlite-plugin/dist/entity/MarkAsNotSuitLog'

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

const isRunFromUi = Boolean(process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE)
const isUiDev = process.env.NODE_ENV === 'development'
export const autoStartChatEventBus = new EventEmitter()

/**
 * @type { import("puppeteer") }
 */
let puppeteer
let StealthPlugin
export async function initPuppeteer () {
  // production
  if (
    isRunFromUi && !isUiDev
  ) {
    const electron = await import('electron')
    const runtimeDependencies = await import(
      'file://' + 
      path.resolve(
        electron.app.getAppPath(),
        '..',
        'external-node-runtime-dependencies/index.mjs'
      )
    )
    puppeteer = runtimeDependencies.puppeteerExtra.default
    StealthPlugin = runtimeDependencies.PuppeteerExtraPluginStealth.default
  } else {
    const importResult = await Promise.all(
      [
        import('puppeteer-extra'),
        import('puppeteer-extra-plugin-stealth')
      ]
    )
    puppeteer = importResult[0].default
    StealthPlugin = importResult[1].default
  }
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

const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const recommendJobPageUrl = `https://www.zhipin.com/web/geek/job-recommend`

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

async function markJobAsNotSuitInRecommendPage () {
  /**
   * @type {{chosenReasonInUi?: { code: number, text: string}}}
   */
  const result = {}
  const notSuitableFeedbackButtonProxy = await page.$('.job-detail-box .job-detail-operate .not-suitable')
  if (notSuitableFeedbackButtonProxy) {
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
        const filterBar = document.querySelector('.job-recommend-main .job-recommend-search')
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
          const activeOptionElAtCurrentFilterProxyList = await page.$$(`.job-recommend-main .recommend-search-more .active[ka^="${optionKaPrefix}"]`)
          for (const it of activeOptionElAtCurrentFilterProxyList) {
            await it.click()
          }
        } else {
          // select 不限 immediately
          const buxianOptionElProxy = await page.$(`.job-recommend-main .recommend-search-more [ka="${optionKaPrefix}${0}"]`)
          await buxianOptionElProxy.click()
        }
      } else {
        //#region uncheck options perviously checked but not existed in current filter.
        const activeOptionElAtCurrentFilterProxyList = await page.$$(`.job-recommend-main .recommend-search-more .active[ka^="${optionKaPrefix}"]`)
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
          const optionElProxy = await page.$(`.job-recommend-main .recommend-search-more [ka="${optionKaPrefix}${optionValue}"]`)
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
    page.goto(recommendJobPageUrl, { timeout: 60 * 1000 }),
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

  const INIT_START_EXCEPT_JOB_INDEX = 1
  let currentExceptJobIndex = INIT_START_EXCEPT_JOB_INDEX
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
          page.waitForSelector('.job-recommend-main .recommend-search-expect .recommend-job-btn'),
          page.waitForSelector('.job-list-container .rec-job-list')
        ])
        const currentActiveJobIndex = await page.evaluate(`
          [...document.querySelectorAll('.job-recommend-main .recommend-search-expect .recommend-job-btn')].findIndex(it => it.classList.contains('active'))
        `)

        expectJobList = await page.evaluate(`document.querySelector('.job-recommend-search')?.__vue__?.expectList`)
        if (currentActiveJobIndex === currentExceptJobIndex) {
          // first navigation and can immediately start chat (recommend job)
        } else {
          // not first navigation and should choose a job (except job)
          // click first expect job
          const expectJobTabHandlers = await page.$$('.job-recommend-main .recommend-search-expect .recommend-job-btn')
          await expectJobTabHandlers[currentExceptJobIndex].click()
          await page.waitForResponse(
            response => {
              if (
                response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json')
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

        try {
          const { targetJobIndex, targetJobData } = await new Promise(async (resolve, reject) => {
            try {
              let requestNextPagePromiseWithResolver = null
              page.on(
                'request',
                function reqHandler (request) {
                  if (request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json')) {
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
              const recommendJobListElProxy = await page.$('.job-list-container .rec-job-list')
              let jobListData = await page.evaluate(`document.querySelector('.job-recommend-main')?.__vue__?.jobList`)
              let hasReachLastPage = false
              let targetJobIndex = -1
              let targetJobData
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                // when disable company allow list, we will believe that the first one in the list is your expect job.
                let tempTargetJobIndexToCheckDetail = enableCompanyAllowList ? jobListData.findIndex(
                  it => !blockBossNotNewChat.has(it.encryptBossId) && !blockBossNotActive.has(it.encryptBossId) && [...expectCompanySet].find(name => it.brandName.includes(name))
                ) : jobListData.findIndex(
                  it => !blockBossNotNewChat.has(it.encryptBossId) && !blockBossNotActive.has(it.encryptBossId)
                )
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
                    await sleep(1)
                    await requestNextPagePromiseWithResolver?.promise
                    hasReachLastPage = await page.evaluate(`
                      !(document.querySelector('.job-recommend-main')?.__vue__?.hasMore)
                    `)
                    if (hasReachLastPage) {
                      console.log(`Arrive the terminal of the job list.`)
                    }
                  }
                  requestNextPagePromiseWithResolver = null

                  await sleep(3000)
                  jobListData = await page.evaluate(
                    `
                      document.querySelector('.job-recommend-main')?.__vue__?.jobList
                    `
                  )
                  tempTargetJobIndexToCheckDetail = jobListData.findIndex(it => !blockBossNotNewChat.has(it.encryptBossId) && !blockBossNotActive.has(it.encryptBossId) && [...expectCompanySet].find(name => it.brandName.includes(name)))
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
                  // save the job detail info
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)

                  //#region
                  // null
                  // 刚刚活跃 // 今日活跃 // 昨日活跃 // 3日内活跃 // 本周活跃
                  // 2周内活跃 // 本月活跃 // 2月内活跃 // 3月内活跃 // 4月内活跃 // 5月内活跃 // 近半年活跃 // 半年前活跃
                  //#endregion
                  if ([
                    '2周内活跃',
                    '本月活跃',
                    '2月内活跃',
                    '3月内活跃',
                    '4月内活跃',
                    '5月内活跃',
                    '近半年活跃',
                    '半年前活跃',
                  ].includes(targetJobData.bossInfo.activeTimeDesc)) {
                    blockBossNotActive.add(targetJobData.jobInfo.encryptUserId)
                    // click prevent recommend button
                    try {
                      const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage()
                      await hooks.jobMarkedAsNotSuit.promise(
                        targetJobData,
                        {
                          markFrom: ChatStartupFrom.AutoFromRecommendList,
                          markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                          extInfo: {
                            bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                            chosenReasonInUi
                          }
                        }
                      )
                    } catch {
                    }
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
          await sleepWithRandomDelay(200)
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')

          await hooks.newChatWillStartup?.promise(targetJobData)
          const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
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
            await sleepWithRandomDelay(750)
            const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
            await closeDialogButtonProxy.click()
            await sleepWithRandomDelay(1000)
          }
          // #endregion
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION': {
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
      currentExceptJobIndex + 1 > expectJobList.length
    ) {
      hooks.noPositionFoundForCurrentJob?.call()
      await Promise.all([
        page.reload(),
        page.waitForNavigation()
      ])
      currentExceptJobIndex = INIT_START_EXCEPT_JOB_INDEX
    } else {
      hooks.noPositionFoundForCurrentJob?.call()
      hooks.noPositionFoundAfterTraverseAllJob?.call()

      currentExceptJobIndex += 1
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
