import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import {
  sleep,
  sleepWithRandomDelay
} from '@bossgeekgo/utils/sleep.mjs'

import fs from 'node:fs'
import { get__dirname } from '@bossgeekgo/utils/legacy-path.mjs';
import path from 'node:path';
import JSON5 from 'json5'

puppeteer.use(StealthPlugin())

const { cookies: bossCookies } = JSON5.parse(
  fs.readFileSync(
    path.join(
      get__dirname(),
      '../../config/boss.json'
    )
  )
)

const targetCompanyList = JSON5.parse(
  fs.readFileSync(
    path.join(
      get__dirname(),
      '../../config/target-company-list.json'
    )
  )
)

if (!bossCookies?.length) {
  console.error('There is no cookies. you can save a copy with EditThisCookie extension.')
  process.exit(1)
}

const recommendJobPageUrl = `https://www.zhipin.com/web/geek/job-recommend`

const expectCompanySet = new Set(targetCompanyList)
const enableCompanyAllowList = Boolean(expectCompanySet.size)

let browser, page

const blockBossNotNewChat = new Set()
export async function mainLoop (hooks) {
  try {
    browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      },
      devtools: true
    })
    hooks.puppeteerLaunched?.call()
  
    page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })
  
    //set cookies
    const copiedBossCookies = JSON.parse(JSON.stringify(bossCookies))

    hooks.cookieWillSet?.call(copiedBossCookies)
    for(let i = 0; i < copiedBossCookies.length; i++){
      await page.setCookie(copiedBossCookies[i]);
    }
  
    await Promise.all([
      page.goto(recommendJobPageUrl, { timeout: 0 }),
      page.waitForNavigation(),
    ])
    hooks.pageLoaded?.call()

    const INIT_START_EXCEPT_JOB_INDEX = 1
    let currentExceptJobIndex = INIT_START_EXCEPT_JOB_INDEX
    afterPageLoad: while (true) {
      await sleepWithRandomDelay(2500)

      await Promise.all([
        page.waitForSelector('.job-recommend-main .recommend-search-expect .recommend-job-btn'),
        page.waitForSelector('.job-list-container .rec-job-list')
      ])
      const currentActiveJobIndex = await page.evaluate(`
        [...document.querySelectorAll('.job-recommend-main .recommend-search-expect .recommend-job-btn')].findIndex(it => it.classList.contains('active'))
      `)

      const expectJobList = await page.evaluate(`document.querySelector('.job-recommend-search')?.__vue__?.expectList`)
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
        await sleepWithRandomDelay(2000)
      }

      try {
        const { targetJobElProxy, targetJobIndex } = await new Promise(async (resolve, reject) => {
          // job list
          const recommendJobListElProxy = await page.$('.job-list-container .rec-job-list')
  
          let jobListData = await page.evaluate(
            `
              document.querySelector('.job-recommend-main')?.__vue__?.jobList
            `
          )
          // when disable company allow list, we will believe that the first one in the list is your expect job.
          let targetJobIndex = enableCompanyAllowList ? jobListData.findIndex(
            it => !blockBossNotNewChat.has(it.encryptBossId) && [...expectCompanySet].find(name => it.brandName.includes(name))
          ) : jobListData.findIndex(
            it => !blockBossNotNewChat.has(it.encryptBossId)
          )

          let hasReachLastPage = false
  
          while (targetJobIndex < 0 && !hasReachLastPage) {
            // fetch new
            const recommendJobListElBBox = await recommendJobListElProxy.boundingBox()
            const windowInnerHeight = await page.evaluate('window.innerHeight')
            await page.mouse.move(
              recommendJobListElBBox.x + recommendJobListElBBox.width / 2,
              windowInnerHeight / 2
            )
            let scrolledHeight = 0
            const targetHeight = 3000
            const increase = 40 + Math.floor(30 * Math.random())
            while (scrolledHeight < targetHeight) {
              scrolledHeight += increase
              await page.mouse.wheel({deltaY: increase});
              await sleep(1)
            }
            hasReachLastPage = await page.evaluate(`
              !(document.querySelector('.job-recommend-main')?.__vue__?.hasMore)
            `)
            if (hasReachLastPage) {
              console.log(`Arrive the terminal of the job list.`)
            }
  
            await sleep(3000)
            jobListData = await page.evaluate(
              `
                document.querySelector('.job-recommend-main')?.__vue__?.jobList
              `
            )
            targetJobIndex = jobListData.findIndex(it => !blockBossNotNewChat.has(it.encryptBossId) && [...expectCompanySet].find(name => it.brandName.includes(name)))
          }
  
          if (targetJobIndex < 0 && hasReachLastPage) {
            // has reach last page and not find target job
            reject(new Error('CANNOT_FIND_EXCEPT_JOB'))
            return
          }
          
          const recommendJobItemList = await recommendJobListElProxy.$$('ul.rec-job-list > li')
          resolve(
            {
              targetJobElProxy: recommendJobItemList[targetJobIndex],
              targetJobIndex
            }
          )
        })
        if (targetJobIndex >= 0) {
          // scroll that target element into view
          await page.evaluate(`
            targetEl = document.querySelector("ul.rec-job-list").children[${targetJobIndex}]
            targetEl.scrollIntoView({
              behavior: 'smooth',
              block: ${Math.random() > 0.5 ? '\'center\'' : '\'end\''}
            })
          `)
    
          await sleepWithRandomDelay(200)
    
          if (targetJobIndex === 0) {
          } else {
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
          const jobData = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
      
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
          if (startChatButtonInnerHTML === '立即沟通') {
            await hooks.newChatWillStartup?.promise(jobData)
            const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
            await startChatButtonProxy.click()
  
            const addFriendResponse = await page.waitForResponse(
              response => {
                if (
                  response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json') && response.url().includes(`jobId=${jobData.jobInfo.encryptId}`)
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
                throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
              } else {
                console.error(res)
                throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
              }
            } else {
              hooks.newChatStartup?.call(jobData)
              blockBossNotNewChat.add(jobData.jobInfo.encryptUserId)

              await sleepWithRandomDelay(750)
              const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
              await closeDialogButtonProxy.click()
              await sleepWithRandomDelay(1000)
            }
          } else {
            blockBossNotNewChat.add(jobData.jobInfo.encryptUserId)
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          switch (err.message) {
            case 'CANNOT_FIND_EXCEPT_JOB': {
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
              continue afterPageLoad;
              break;
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

    // ;await browser.close()
  } catch (err) {
    browser.close()
    browse = null
    page = null

    console.error(err)
    throw err
  }
}
