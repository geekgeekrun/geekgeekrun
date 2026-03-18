import { sleep, sleepWithRandomDelay } from '@geekgeekrun/utils/sleep.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { setDomainLocalStorage } from '@geekgeekrun/utils/puppeteer/local-storage.mjs'
import { readConfigFile, readStorageFile, writeStorageFile, ensureConfigFileExist, ensureStorageFileExist, getMergedJobConfig } from './runtime-file-utils.mjs'
import {
  BOSS_RECOMMEND_PAGE_URL,
  BOSS_CHAT_PAGE_URL,
  RECOMMEND_JOB_DROPDOWN_LABEL_SELECTOR,
  RECOMMEND_JOB_ITEM_SELECTOR
} from './constant.mjs'
import { setupNetworkInterceptor, setupCanvasTextHook } from './resume-extractor.mjs'
import { parseCandidateList, filterCandidates, scrollAndLoadMore } from './candidate-processor.mjs'
import { processCandidate, checkDailyLimit, clickNotInterested } from './chat-handler.mjs'
import { setLevel, debug as logDebug, info as logInfo, warn as logWarn, error as logError } from './logger.mjs'

export { default as startBossChatPageProcess } from './chat-page-processor.mjs'

ensureConfigFileExist()
ensureStorageFileExist()

/** 招聘端自动化事件总线（参照 autoStartChatEventBus 模式） */
export const bossAutoBrowseEventBus = new EventEmitter()

/**
 * @type { import('puppeteer') }
 */
let puppeteer
let StealthPlugin
let LaodengPlugin
let AnonymizeUaPlugin

/**
 * 初始化 Puppeteer（puppeteer-extra + stealth + laodeng + anonymize-ua）
 * @returns {{ puppeteer: import('puppeteer'), StealthPlugin: unknown, LaodengPlugin: unknown, AnonymizeUaPlugin: unknown }}
 */
export async function initPuppeteer () {
  logDebug('[boss-auto-browse] initPuppeteer: 开始动态加载插件')
  const importResult = await Promise.all([
    import('puppeteer-extra'),
    import('puppeteer-extra-plugin-stealth'),
    import('@geekgeekrun/puppeteer-extra-plugin-laodeng'),
    import('puppeteer-extra-plugin-anonymize-ua')
  ])
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  LaodengPlugin = importResult[2].default
  AnonymizeUaPlugin = importResult[3].default
  puppeteer.use(StealthPlugin())
  puppeteer.use(LaodengPlugin())
  puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }))
  logDebug('[boss-auto-browse] initPuppeteer: 插件已注册')
  return {
    puppeteer,
    StealthPlugin,
    LaodengPlugin,
    AnonymizeUaPlugin
  }
}

/** 招聘端 localStorage 生效的页面 URL（与 geek 端一致使用 desktop） */
const localStoragePageUrl = 'https://www.zhipin.com/desktop/'

/**
 * 启动浏览器并导航到沟通页（供多职位队列中「仅沟通页」场景使用）
 * @returns {{ browser: import('puppeteer').Browser, page: import('puppeteer').Page }}
 */
export async function launchBrowserAndNavigateToChat () {
  if (!puppeteer) await initPuppeteer()
  const headless = process.env.HEADLESS === '1'
  const browser = await puppeteer.launch({
    headless,
    ignoreHTTPSErrors: true,
    protocolTimeout: 120000,
    defaultViewport: { width: 1440, height: 900 - 140 }
  })
  const page = (await browser.pages())[0]
  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')
  if (Array.isArray(bossCookies) && bossCookies.length > 0) {
    await page.setCookie(...bossCookies)
  }
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage || {})
  await page.goto(BOSS_CHAT_PAGE_URL, { timeout: 60 * 1000 })
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 120 * 1000 })
  await new Promise(r => setTimeout(r, 1500))
  return { browser, page }
}

/**
 * 将当前 page 的 cookie 和 localStorage 持久化到本地
 * @param { import('puppeteer').Page } page
 */
async function storeStorage (page) {
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

/**
 * 招聘端 hooks 类型（由调用方传入，此处仅作文档说明）
 * - beforeBrowserLaunch: AsyncSeriesHook
 * - afterBrowserLaunch: AsyncSeriesHook
 * - beforeNavigateToRecommend: AsyncSeriesHook
 * - onCandidateListLoaded: AsyncSeriesHook
 * - onCandidateFiltered: AsyncSeriesWaterfallHook
 * - beforeStartChat: AsyncSeriesHook
 * - afterChatStarted: AsyncSeriesHook
 * - onError: AsyncSeriesHook
 * - onComplete: AsyncSeriesHook
 */

/**
 * 招聘端自动浏览与开聊主入口
 * @param {{
 *   beforeBrowserLaunch?: import('tapable').AsyncSeriesHook<[]>,
 *   afterBrowserLaunch?: import('tapable').AsyncSeriesHook<[]>,
 *   beforeNavigateToRecommend?: import('tapable').AsyncSeriesHook<[]>,
 *   onCandidateListLoaded?: import('tapable').AsyncSeriesHook<[]>,
 *   onCandidateFiltered?: import('tapable').AsyncSeriesWaterfallHook<[unknown, unknown]>,
 *   beforeStartChat?: import('tapable').AsyncSeriesHook<[unknown]>,
 *   afterChatStarted?: import('tapable').AsyncSeriesHook<[unknown, unknown]>,
 *   onError?: import('tapable').AsyncSeriesHook<[unknown]>,
 *   onComplete?: import('tapable').AsyncSeriesHook<[]>
 * }} hooksFromCaller
 * @param {{ returnBrowser?: boolean }} [opts] - 若 true，结束时不关闭 browser 并返回 { browser, page }，由调用方关闭
 */
/**
 * 在推荐页切换到指定职位（主页面操作，不在 iframe 内）。
 * @param {import('puppeteer').Page} page
 * @param {string} jobId
 */
async function switchRecommendJobId (page, jobId) {
  try {
    await page.click(RECOMMEND_JOB_DROPDOWN_LABEL_SELECTOR)
    await page.waitForSelector(RECOMMEND_JOB_ITEM_SELECTOR, { timeout: 5000 })
    const found = await page.evaluate((jid) => {
      const item = document.querySelector(`#headerWrap ul.job-list li.job-item[value="${jid}"]`)
      if (!item) return false
      item.click()
      return true
    }, jobId)
    if (!found) {
      logWarn(`[boss-auto-browse] 职位 ${jobId} 未在下拉列表中找到，将使用默认职位继续`)
      // 关闭下拉
      await page.keyboard.press('Escape')
      return
    }
    // 等候选人列表重新加载
    await new Promise(r => setTimeout(r, 500))
    logInfo(`[boss-auto-browse] 已切换到职位 ${jobId}`)
  } catch (e) {
    logWarn(`[boss-auto-browse] 切换推荐页职位失败（${e.message}），将使用默认职位继续`)
  }
}

export default async function startBossAutoBrowse (hooksFromCaller, opts = {}) {
  const hooks = hooksFromCaller || {}
  const returnBrowser = opts.returnBrowser === true
  const jobId = opts.jobId ?? null
  const existingBrowser = opts.browser ?? null
  const existingPage = opts.page ?? null
  const reuseBrowser = !!(existingBrowser && existingPage)
  setLevel((readConfigFile('boss-recruiter.json') || {}).logLevel || 'info')

  if (!puppeteer) {
    logDebug('[boss-auto-browse] puppeteer 未初始化，正在 initPuppeteer()')
    await initPuppeteer()
  }

  /** @type { import('puppeteer').Browser } */
  let browser
  /** @type { import('puppeteer').Page } */
  let page

  try {
    if (reuseBrowser) {
      browser = existingBrowser
      page = existingPage
      logDebug('[boss-auto-browse] 复用已有浏览器实例')
    } else {
      await hooks.beforeBrowserLaunch?.promise?.()

      const headlessEnv = process.env.HEADLESS
      const headless = headlessEnv === '1'
      logDebug('[boss-auto-browse] 即将启动浏览器', { headless, HEADLESS_env: headlessEnv ?? null })
      browser = await puppeteer.launch({
        headless,
        ignoreHTTPSErrors: true,
        protocolTimeout: 120000,
        defaultViewport: {
          width: 1440,
          height: 900 - 140
        }
      })

      page = (await browser.pages())[0]

      await hooks.afterBrowserLaunch?.promise?.()
    }

    const bossCookies = readStorageFile('boss-cookies.json')
    const bossLocalStorage = readStorageFile('boss-local-storage.json')

    // -----------------------------------------------------------------------
    // 直接导航到推荐牛人页（注入 Cookie / localStorage 后 goto；复用浏览器时若已在推荐页可跳过 goto）
    // -----------------------------------------------------------------------
    await hooks.beforeNavigateToRecommend?.promise?.()
    if (Array.isArray(bossCookies) && bossCookies.length > 0) {
      await page.setCookie(...bossCookies)
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage || {})
    const alreadyOnRecommend = page.url().startsWith(BOSS_RECOMMEND_PAGE_URL)
    if (!alreadyOnRecommend) {
      await page.goto(BOSS_RECOMMEND_PAGE_URL, { timeout: 60 * 1000 })
    }
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 120 * 1000 }
    )

    // 等待 SPA 路由稳定（readyState=complete 后 SPA 可能还会重定向）
    await new Promise(r => setTimeout(r, 1500))

    await page.bringToFront()

    if (
      page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
      page.url().startsWith('https://www.zhipin.com/web/common/error.html')
    ) {
      throw new Error('ACCESS_IS_DENIED')
    }

    /**
     * 检查是否需要登录（包含重定向到首页的情况）
     * @returns {Promise<boolean>}
     */
    const checkNeedLogin = async () => {
      const url = page.url()
      // 首页 / 登录页 / 非推荐牛人页都视为需要登录
      if (url === 'https://www.zhipin.com/' || url === 'https://www.zhipin.com') {
        return true
      }
      return page.evaluate((recommendUrl) => {
        const href = location.href
        return !href.startsWith(recommendUrl) || /\/login|\/wapi\/zppassport\//.test(href)
      }, BOSS_RECOMMEND_PAGE_URL)
    }

    /**
     * 等待用户登录并回到推荐牛人页
     */
    const waitForLoginAndRedirect = async () => {
      logInfo('[boss-auto-browse] 未登录或已过期，请在推荐牛人 Tab 中完成登录，登录成功后将继续执行…')
      await page.waitForFunction(
        (recommendUrl) => {
          const href = location.href
          return href.startsWith(recommendUrl) && document.readyState === 'complete'
        },
        { timeout: 300 * 1000 },
        BOSS_RECOMMEND_PAGE_URL
      )
      // 再等待 SPA 稳定
      await new Promise(r => setTimeout(r, 1500))
      await storeStorage(page).catch(() => {})
      logInfo('[boss-auto-browse] 登录成功，已保存 Cookie。')
    }

    if (await checkNeedLogin()) {
      await waitForLoginAndRedirect()
    } else {
      await storeStorage(page).catch(() => {})
    }

    // 切换职位（若指定了 jobId 且非全部职位标志）
    if (jobId && jobId !== '-1' && jobId !== '0') {
      await switchRecommendJobId(page, jobId)
    }

    // -----------------------------------------------------------------------
    // 获取推荐牛人 iframe 的 Frame 对象（候选人列表在 iframe 内渲染）
    // iframe 在 Vue 异步渲染期间可能多次导航，Frame 对象会被销毁重建，需重试获取
    // 若在等待过程中发现页面跳转到非推荐牛人页（如首页），则触发登录等待
    // -----------------------------------------------------------------------
    logDebug('[boss-auto-browse] 等待候选人列表渲染（iframe）...')

    const getRecommendFrame = () => {
      return page.frames().find(f => f.name() === 'recommendFrame') ?? null
    }

    const recommendFrame = await (async () => {
      const deadline = Date.now() + 60 * 1000
      while (Date.now() < deadline) {
        // 若页面被重定向（首页或登录页），等待用户重新登录
        if (await checkNeedLogin()) {
          await waitForLoginAndRedirect()
          // 登录后重置计时器，再给 60s 等待 iframe
          // （通过 continue 重新进入循环，deadline 已过则会退出，不过登录成功后通常很快出现）
        }

        try {
          const f = getRecommendFrame()
          if (!f) {
            await new Promise(r => setTimeout(r, 500))
            continue
          }
          // 尝试在 frame 内查找候选人列表
          const el = await f.waitForSelector('ul.card-list > li.card-item', { timeout: 5000 })
          if (el) return f
        } catch (_) {
          // frame 导航中或 context 销毁，稍等重试
          await new Promise(r => setTimeout(r, 500))
        }
      }
      throw new Error('等待推荐牛人 iframe 候选人列表超时（60s）')
    })()

    logInfo('[boss-auto-browse] 候选人列表已就绪')

    // -----------------------------------------------------------------------
    // 设置网络拦截器 + Canvas hook（登录成功后立即启动，仅针对推荐牛人 Tab）
    // -----------------------------------------------------------------------
    const { getInterceptedData } = setupNetworkInterceptor(page)
    await setupCanvasTextHook(page)

    // -----------------------------------------------------------------------
    // 读取配置（若指定 jobId 则使用 per-job 合并配置）
    // -----------------------------------------------------------------------
    const baseConfig = readConfigFile('boss-recruiter.json') || {}
    const config = jobId ? getMergedJobConfig(jobId) : { ...baseConfig, candidateFilter: readConfigFile('candidate-filter.json') || {} }
    setLevel(config?.logLevel || 'info')
    let filterConfig = config.candidateFilter || readConfigFile('candidate-filter.json') || {}
    const recommendPageOpts = config?.recommendPage || baseConfig?.recommendPage || {}
    const clickNotInterestedForFiltered = recommendPageOpts.clickNotInterestedForFiltered !== false
    const runOnceAfterComplete = recommendPageOpts.runOnceAfterComplete === true
    const delayBetweenNotInterestedMs = recommendPageOpts.delayBetweenNotInterestedMs ?? [800, 2500]
    filterConfig = { ...filterConfig, skipViewedCandidates: recommendPageOpts.skipViewedCandidates ?? filterConfig.skipViewedCandidates }

    const maxChatPerRun = config?.autoChat?.maxChatPerRun ?? 50
    let chatCount = 0
    let notInterestedLimitReached = false  // 当天"不感兴趣"上限，达到后跳过点击但继续打招呼

    // -----------------------------------------------------------------------
    // 主循环：解析 → 筛选 → 开聊 → 翻页/滚动
    // -----------------------------------------------------------------------
    await hooks.onCandidateListLoaded?.promise?.()

    mainLoop: while (true) {
      // a. 解析候选人列表（在 iframe 的 frame 内操作）
      logDebug('[boss-auto-browse] 主循环：开始解析候选人列表...')
      let candidates = []
      try {
        candidates = await parseCandidateList(recommendFrame)
        logInfo('[boss-auto-browse] 解析完成，共', candidates.length, '人')
      } catch (parseErr) {
        logWarn('[boss-auto-browse] parseCandidateList 失败，跳过本轮:', parseErr.message)
      }

      if (candidates.length === 0) {
        logDebug('[boss-auto-browse] 候选人列表为空，尝试滚动加载…')
        const hasMore = await scrollAndLoadMore(recommendFrame).catch(() => false)
        if (!hasMore) {
          logInfo('[boss-auto-browse] 没有更多候选人，结束本次运行。')
          break mainLoop
        }
        await sleepWithRandomDelay(1000)
        continue
      }

      // b. 筛选候选人（经由 onCandidateFiltered waterfall hook，让外部插件也能参与过滤）
      const rawFilterResult = filterCandidates(candidates, filterConfig)
      const skippedListForLog = Array.isArray(rawFilterResult?.skipped)
        ? [...rawFilterResult.skipped]
        : []
      let filterResult = rawFilterResult
      if (hooks.onCandidateFiltered?.promise) {
        try {
          const hookResult = await hooks.onCandidateFiltered.promise(candidates, filterResult)
          if (hookResult != null && (Array.isArray(hookResult.matched) || Array.isArray(hookResult.skipped))) {
            filterResult = hookResult
          }
        } catch (_) { /* hook 出错不影响主流程 */ }
      }

      // filterResult.matched 的每项是 { candidate, filterResult } 包装对象；无人 tap 时 hook 返回 undefined，用 rawFilterResult
      const matchedItems = Array.isArray(filterResult?.matched) ? filterResult.matched : rawFilterResult.matched || []
      // 将每个 matched candidate 映射回 candidates 数组中的原始索引，用于在 iframe li.card-item 列表中定位
      const matched = matchedItems.map(item => {
        const c = item?.candidate ?? item
        const originalIndex = candidates.indexOf(c)
        return { candidate: c, originalIndex: originalIndex >= 0 ? originalIndex : 0 }
      })

      for (const item of skippedListForLog) {
        const candidate = item?.candidate ?? item
        const fr = item?.filterResult ?? item
        const name = candidate?.geekName ?? candidate?.encryptGeekId ?? '?'
        const detail = fr?.reasonDetail ?? `不满足条件 ${fr?.reason ?? 'unknown'}`
        logInfo(`[boss-auto-browse] 跳过 ${name}：${detail}`)
      }
      if (skippedListForLog.length > 0) {
        const reasonCounts = {}
        for (const item of skippedListForLog) {
          const r = item?.filterResult?.reason ?? 'unknown'
          reasonCounts[r] = (reasonCounts[r] || 0) + 1
        }
        logInfo('[boss-auto-browse] 跳过原因统计：', reasonCounts)
      }
      if (matched.length > 0) {
        const passedNames = matched.map(m => m.candidate?.geekName ?? m.candidate?.encryptGeekId ?? '?').join('、')
        logInfo('[boss-auto-browse] 本轮通过筛选：', passedNames)
      }
      logInfo(`[boss-auto-browse] 本轮候选人：共 ${candidates.length} 人，筛选通过 ${matched.length} 人`)

      // 对未通过筛选的候选人点击"不感兴趣"，并按筛选原因选对应弹窗选项以优化 BOSS 推荐；每次点击间隔随机延迟（反检测）
      if (clickNotInterestedForFiltered && !notInterestedLimitReached && skippedListForLog.length > 0) {
        const cursor = await (await import('./humanMouse.mjs')).createHumanCursor(page)
        const indexToFilterResult = new Map()
        for (const item of skippedListForLog) {
          const idx = candidates.indexOf(item?.candidate ?? item)
          if (idx >= 0) indexToFilterResult.set(idx, item?.filterResult ?? item)
        }
        const sortedIndices = skippedListForLog
          .map(s => candidates.indexOf(s?.candidate ?? s))
          .filter(i => i >= 0)
          .sort((a, b) => b - a)
        logInfo('[boss-auto-browse] 将对', sortedIndices.length, '人点击"不感兴趣"（原因与筛选一致）')
        const delayRange = Array.isArray(delayBetweenNotInterestedMs) && delayBetweenNotInterestedMs.length >= 2
          ? delayBetweenNotInterestedMs
          : [800, 2500]
        for (let i = 0; i < sortedIndices.length; i++) {
          const idx = sortedIndices[i]
          const fr = indexToFilterResult.get(idx)
          logDebug('[boss-auto-browse] 正在对 index=', idx, ' 点击"不感兴趣"（reason=', fr?.reason ?? 'unknown', '）')
          try {
            const niResult = await clickNotInterested(recommendFrame, idx, cursor, {
              logPrefix: '[boss-auto-browse]',
              filterResult: fr
            })
            if (niResult === 'NOT_INTERESTED_LIMIT_REACHED') {
              notInterestedLimitReached = true
              logInfo('[boss-auto-browse] 当天"不感兴趣"上限已达，本次及后续轮次将跳过，继续处理打招呼')
              break
            }
            if (i < sortedIndices.length - 1) {
              const [minMs, maxMs] = delayRange
              const delay = minMs + Math.random() * (maxMs - minMs)
              await sleep(delay)
            }
          } catch (e) {
            logWarn('[boss-auto-browse] 点击不感兴趣失败（index=', idx, '）:', e?.message)
          }
        }
      }

      if (matched.length === 0) {
        // 全被过滤掉，继续翻页/滚动加载下一批
        logDebug('[boss-auto-browse] 本轮无匹配候选人，继续滚动加载…')
        const hasMore = await scrollAndLoadMore(recommendFrame).catch(() => false)
        if (!hasMore) {
          logInfo('[boss-auto-browse] 已加载全部候选人，结束本次运行。')
          break mainLoop
        }
        await sleepWithRandomDelay(1500)
        continue
      }

      // c. 逐一处理匹配的候选人
      for (let i = 0; i < matched.length; i++) {
        const { candidate, originalIndex } = matched[i]

        // 检查每日限额（在主页面检查）
        const limitStatus = await checkDailyLimit(page).catch(() => ({ limitReached: false }))
        if (limitStatus.limitReached) {
          logInfo('[boss-auto-browse] 今日沟通人数已达上限，停止运行。')
          break mainLoop
        }

        if (chatCount >= maxChatPerRun) {
          logInfo(`[boss-auto-browse] 本次运行已开聊 ${chatCount} 人，达到上限，停止运行。`)
          break mainLoop
        }

        // d. 开聊（在 iframe frame 内操作，弹窗处理在主页面）
        logDebug('[boss-auto-browse] 开始处理候选人', candidate.geekName, '（index=', originalIndex, '）')
        let procesResult
        try {
          procesResult = await processCandidate(
            recommendFrame,
            candidate,
            config,
            hooks,
            { getInterceptedData, candidateIndex: originalIndex, mainPage: page }
          )
        } catch (procErr) {
          logError('[boss-auto-browse] processCandidate 异常（', candidate.geekName, '）:', procErr.message)
          continue
        }

        const { chatResult } = procesResult
        if (chatResult.success) {
          chatCount++
          await hooks.onProgress?.promise?.({ phase: 'recommend', current: chatCount, max: maxChatPerRun }).catch(() => {})
          logInfo('[boss-auto-browse] ✓ 已向', candidate.geekName, '发送招呼（本次共', chatCount, '人）')
        } else {
          logInfo('[boss-auto-browse] ✗', candidate.geekName, '开聊失败：', chatResult.reason)
          if (chatResult.reason === 'DAILY_LIMIT_REACHED' || chatResult.reason === 'RISK_CONTROL') {
            break mainLoop
          }
        }
      }

      // e. 滚动加载 / 翻页（在 iframe frame 内操作）
      logDebug('[boss-auto-browse] 本轮匹配已处理完，滚动加载更多…')
      const hasMore = await scrollAndLoadMore(recommendFrame).catch(() => false)
      if (!hasMore) {
        logInfo('[boss-auto-browse] 已加载全部候选人，结束本次运行。')
        break mainLoop
      }
      await sleepWithRandomDelay(1500)
    }

    await hooks.onComplete?.promise?.()
    logInfo('[boss-auto-browse] 本次运行完成，共成功开聊', chatCount, '人。')

    if (returnBrowser && browser && page) {
      return { browser, page }
    }
  } catch (err) {
    await hooks.onError?.promise?.(err)
    throw err
  } finally {
    if (browser && !returnBrowser) {
      try {
        await browser.close()
      } catch (e) {
        void e
      }
    }
  }
}
