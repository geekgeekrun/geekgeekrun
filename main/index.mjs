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
const pages = []
globalThis.pages = pages

const expectCompanySet = new Set(targetCompanyList)

;(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1440,
        height: 900 - 140,
      },
      devtools: true
    })
  
    const page = await browser.newPage()
    sleep(2000).then(() => {
      page.bringToFront()
    })
  
    //set cookies
    for(let i = 0; i < bossCookies.length; i++){
      await page.setCookie(bossCookies[i]);
    }
  
    await page.goto(recommendJobPageUrl, { timeout: 0 })
    pages.push(page)
  
    await sleepWithRandomDelay(2500)
    
    const recommendJobLink = (await pages[0].$('[ka=header-job-recommend]'))
    await recommendJobLink.click()

    while (true) {
      await sleepWithRandomDelay(3000)
  
      const expectJobList = (await pages[0].evaluate(`
        document.querySelector('.job-recommend-search')?.__vue__?.expectList
      `)
      )
      
      const expectJobTabHandlers = await pages[0].$$('.job-recommend-main .recommend-search-expect .recommend-job-btn')
      expectJobTabHandlers.shift()
  
      // click first expect job
      await expectJobTabHandlers[0].click()
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

      const { targetJobElProxy, targetJobIndex } = await new Promise(async (resolve) => {
        // job list
        const recommendJobListElProxy = await pages[0].$('.job-list-container .rec-job-list')

        let jobListData = await pages[0].evaluate(
          `
            document.querySelector('.job-recommend-main')?.__vue__?.jobList
          `
        )
        let targetJobIndex = jobListData.findIndex(it => [...expectCompanySet].find(name => it.brandName.includes(name)))
        while (targetJobIndex < 0) {
          // fetch new
          const recommendJobListElBBox = await recommendJobListElProxy.boundingBox()
          const windowInnerHeight = await pages[0].evaluate('window.innerHeight')
          await pages[0].mouse.move(
            recommendJobListElBBox.x + recommendJobListElBBox.width / 2,
            windowInnerHeight / 2
          )
          let scrolledHeight = 0
          const targetHeight = 3000
          const increase = 40 + Math.floor(30 * Math.random())
          while (scrolledHeight < targetHeight) {
            scrolledHeight += increase
            await pages[0].mouse.wheel({deltaY: increase});
            await sleep(1)
          }

          await sleep(3000)
          jobListData = await pages[0].evaluate(
            `
              document.querySelector('.job-recommend-main')?.__vue__?.jobList
            `
          )
          targetJobIndex = targetJobIndex = jobListData.findIndex(it => [...expectCompanySet].find(name => it.brandName.includes(name)))
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
        await pages[0].evaluate(`
          const targetEl = document.querySelector("ul.rec-job-list").children[${targetJobIndex}]
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
      }

      const jobData = await pages[0].evaluate('document.querySelector(".job-detail-box").__vue__.data')
  
      const startChatButtonInnerHTML = await pages[0].evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
      if (startChatButtonInnerHTML === '立即沟通') {
        const startChatButtonProxy = await pages[0].$('.job-detail-box .op-btn.op-btn-chat')
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
          const continueChatButtonProxy = await pages[0].$('.greet-boss-dialog .greet-boss-footer .sure-btn')

          await continueChatButtonProxy.click()
          //#endregion
          await sleepWithRandomDelay(2500)
          if (pages[0].url().startsWith('https://www.zhipin.com/web/geek/chat')) {
            await sleepWithRandomDelay(3000)

            await Promise.all([
              pages[0].waitForNavigation(),
              pages[0].goBack(),
            ])
            await sleepWithRandomDelay(1000)
          }
        }
      } else {
      }
    }

    // ;await browser.close()
  } catch (err) {
    console.error(err)
  }
})()
