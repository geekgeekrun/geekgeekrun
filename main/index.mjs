import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import bossCookies from '../runtime/boss-cookies.mjs'
import targetCompanyList from '../runtime/target-company-list.mjs'

import {
  sleep,
  sleepWithRandomDelay
} from './utils.mjs'

puppeteer.use(StealthPlugin())

if (!bossCookies?.length) {
  console.error('There is no cookies. you can save a copy with EditThisCookie extension.')
  process.exit(1)
}

const recommendJobPageUrl = `https://www.zhipin.com/web/geek/job-recommend`

const expectCompanySet = new Set(targetCompanyList)

let browser, page

const blockBossNotNewChat = new Set()
async function mainLoop () {
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
  
    page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })
  
    //set cookies
    for(let i = 0; i < bossCookies.length; i++){
      await page.setCookie(bossCookies[i]);
    }
  
    await Promise.all([
      page.goto(recommendJobPageUrl, { timeout: 0 }),
      page.waitForNavigation(),
    ])
    const INIT_START_EXCEPT_JOB_INDEX = 0
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
          let targetJobIndex = jobListData.findIndex(
            it => !blockBossNotNewChat.has(it.encryptBossId) && [...expectCompanySet].find(name => it.brandName.includes(name))
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
        if (targetJobIndex > 0) {
          // scroll that target element into view
          await page.evaluate(`
            targetEl = document.querySelector("ul.rec-job-list").children[${targetJobIndex}]
            targetEl.scrollIntoView({
              behavior: 'smooth',
              block: ${Math.random() > 0.5 ? '\'center\'' : '\'end\''}
            })
          `)
    
          await sleepWithRandomDelay(200)
    
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
          const jobData = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
      
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
          if (startChatButtonInnerHTML === '立即沟通') {
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
            try {
              const res = await addFriendResponse.json()
      
              if (res.code !== 0) {
                console.err(res)
                break
              } 
            } catch(err) {
              // console.warn(err)
            } finally {
              //#region TODO: temporary work with legacy logic
              await sleep(500)
              const continueChatButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .sure-btn')
  
              await continueChatButtonProxy.click()
              //#endregion
              await sleepWithRandomDelay(2500)
              if (page.url().startsWith('https://www.zhipin.com/web/geek/chat')) {
                await sleepWithRandomDelay(3000)
  
                await Promise.all([
                  page.waitForNavigation(),
                  page.goBack(),
                ])
                await sleepWithRandomDelay(1000)
              }
            }
          } else {
            blockBossNotNewChat.add(jobData.jobInfo.encryptUserId)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CANNOT_FIND_EXCEPT_JOB') {
          if (
            currentExceptJobIndex + 1 > expectJobList.length
          ) {
            await Promise.all([
              page.reload(),
              page.waitForNavigation()
            ])
            currentExceptJobIndex = INIT_START_EXCEPT_JOB_INDEX
          } else {
            currentExceptJobIndex += 1
          }
          continue afterPageLoad;
        } else {
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

;(async () => {
  while (true) {
    try {
      await mainLoop()
    } catch (err) {
      void err
    }
  }
})()
