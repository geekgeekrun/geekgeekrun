/**
 * 候选人列表解析与筛选逻辑
 * 选择器值目前为 TODO 占位符，需在招聘端账号登录后通过 DevTools 确认真实值后再生效。
 */

import {
  CANDIDATE_LIST_SELECTOR,
  CANDIDATE_ITEM_SELECTOR,
  CANDIDATE_NAME_SELECTOR,
  NEXT_PAGE_BUTTON_SELECTOR
} from './constant.mjs'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { createHumanCursor } from './humanMouse.mjs'
import { debug as logDebug, info as logInfo, warn as logWarn } from './logger.mjs'

/**
 * 从工作经验描述中解析年数（取区间最大值或单值）
 * @param {string} workExpDesc - 如 "1-3年"、"3-5年"、"经验不限"、"26年应届生"
 * @returns {number|null} 年数，无法解析时返回 null；应届生/经验不限视为 0
 */
function parseWorkExpYears (workExpDesc) {
  if (!workExpDesc || typeof workExpDesc !== 'string') return null
  // 应届生、经验不限视为 0 年（优先于数字匹配，避免 "26年应届生" 被解析成 26）
  if (/应届生|经验不限|不限/i.test(workExpDesc)) return 0
  const match = workExpDesc.match(/(\d+)\s*[-~]\s*(\d+)\s*年?/) || workExpDesc.match(/(\d+)\s*年?/)
  if (match) {
    if (match[2] !== undefined) return Math.max(parseInt(match[1], 10), parseInt(match[2], 10))
    return parseInt(match[1], 10)
  }
  return null
}

/**
 * 从薪资描述中解析区间（单位：千/月 或 万/月，取可比较数值）
 * @param {string} salaryDesc - 如 "3-5K"、"10-15K"、"20-30K"
 * @returns {{ low: number, high: number }|null}
 */
function parseSalaryRange (salaryDesc) {
  if (!salaryDesc || typeof salaryDesc !== 'string') return null
  const normalized = salaryDesc.replace(/\s/g, '')
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)\s*[Kk万w]?/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*[Kk万w]?/i)
  if (match) {
    let low = parseFloat(match[1])
    let high = match[2] !== undefined ? parseFloat(match[2]) : low
    if (/万|w/i.test(normalized)) {
      low *= 10
      high *= 10
    }
    return { low, high }
  }
  return null
}

/**
 * 在 page 上解析候选人列表：优先从 Vue 组件数据获取，失败则从 DOM 解析
 * @param { import('puppeteer').Page } page
 * @returns { Promise<Array<{ encryptGeekId: string, geekName: string, education?: string, workExp?: string, city?: string, jobTitle?: string, salary?: string, skills?: string, [key: string]: unknown }>> }
 */
export async function parseCandidateList (page) {
  const listSelector = CANDIDATE_LIST_SELECTOR
  const itemSelector = CANDIDATE_ITEM_SELECTOR
  const nameSelector = CANDIDATE_NAME_SELECTOR

  logDebug('[candidate-processor] parseCandidateList 开始', { listSelector, itemSelector })

  if (!listSelector) {
    logWarn('[candidate-processor] CANDIDATE_LIST_SELECTOR 未配置（TODO），请登录招聘端后从 DevTools 确认选择器。')
    return []
  }

  try {
    // 方式一：通过 Vue __vue__ / __vue_app__ 获取列表数据
    const vueData = await page.evaluate((selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      // Vue 2
      const v2 = el.__vue__
      if (v2) {
        const list = v2.candidateList ?? v2.geekList ?? v2.recommendList ?? v2.list ?? v2.$data?.candidateList ?? v2.$data?.geekList ?? v2.$data?.recommendList ?? v2.$data?.list
        if (Array.isArray(list) && list.length) return list
      }
      // Vue 3
      const v3 = el.__vue_app__
      if (v3?.config?.globalProperties) return null
      const v3Data = el.__vueParentComponent?.ctx ?? el.__vnode?.ctx
      if (v3Data) {
        const list = v3Data.candidateList ?? v3Data.geekList ?? v3Data.recommendList ?? v3Data.list
        if (Array.isArray(list) && list.length) return list
      }
      return null
    }, listSelector)

    if (vueData && Array.isArray(vueData)) {
      logDebug('[candidate-processor] 从 Vue 数据解析到', vueData.length, '人')
      return vueData.map((item) => ({
        encryptGeekId: item.encryptGeekId ?? item.encryptUserId ?? item.geekId ?? item.id ?? '',
        geekName: item.geekName ?? item.name ?? item.userName ?? '',
        education: item.educationLevel ?? item.education ?? item.degree,
        workExp: item.workExpYears ?? item.workExp ?? item.experience,
        city: item.city ?? item.cityName,
        jobTitle: item.jobTitle ?? item.expectPosition ?? item.position,
        salary: item.salaryExpect ?? item.salary ?? item.expectSalary,
        skills: item.skills ?? item.skillList ?? (Array.isArray(item.skillTags) ? item.skillTags.join(',') : ''),
        ...item
      }))
    }

    // 方式二：DOM 解析兜底（依赖 CANDIDATE_ITEM_SELECTOR 等，当前为 TODO 时可能为空）
    if (!itemSelector) {
      logDebug('[candidate-processor] 无 itemSelector，跳过 DOM 解析')
      return []
    }

    logDebug('[candidate-processor] 尝试从 DOM 解析...')
    const domList = await page.evaluate((opts) => {
      const items = document.querySelectorAll(opts.itemSelector)
      const result = []
      items.forEach((node) => {
        // encryptGeekId 在 div.card-inner[data-geek] 上
        const cardInner = node.querySelector('div.card-inner')
        const cardWrap = node.querySelector('div.candidate-card-wrap')
        const encryptGeekId = cardInner?.getAttribute('data-geek') ?? cardInner?.getAttribute('data-geekid') ?? ''
        const hasViewed = cardWrap?.classList?.contains('has-viewed') ?? false

        const nameEl = opts.nameSelector ? node.querySelector(opts.nameSelector) : null
        const name = nameEl?.textContent?.trim() ?? ''

        // 薪资：div.salary-wrap > span
        const salary = node.querySelector('div.salary-wrap span')?.textContent?.trim() ?? null

        // 基本信息区（年龄、工作年限、学历）：div.base-info span（不含 i 分隔符）
        const baseInfoSpans = Array.from(node.querySelectorAll('div.base-info span')).map(el => el.textContent.trim()).filter(Boolean)
        // baseInfoSpans[0]=年龄, [1]=工作年限, [2]=学历, [3]=求职状态（顺序不固定，但经验含"年"，学历含特定文字）
        const workExp = baseInfoSpans.find(s => /年|经验不限/.test(s)) ?? null
        const education = baseInfoSpans.find(s => /本科|硕士|博士|大专|专科|MBA|中专|高中|初中/.test(s)) ?? null

        // 期望城市与职位：div.expect-wrap span.content 内的 join-text-wrap > span
        const expectWrap = node.querySelector('div.expect-wrap span.content div.join-text-wrap')
        const expectSpans = expectWrap ? Array.from(expectWrap.querySelectorAll('span')).map(el => el.textContent.trim()).filter(Boolean) : []
        const city = expectSpans[0] ?? null
        const jobTitle = expectSpans[1] ?? null

        result.push({
          encryptGeekId,
          geekName: name,
          education,
          workExp,
          city,
          jobTitle,
          salary,
          skills: null,
          _hasViewed: hasViewed,
          _fromDom: true
        })
      })
      return result
    }, { itemSelector, nameSelector })

    logDebug('[candidate-processor] DOM 解析到', domList.length, '人')
    return domList
  } catch (err) {
    logWarn('[candidate-processor] parseCandidateList 失败:', err.message)
    return []
  }
}

/**
 * 将配置的薪资区间规范为"千/月"单位。若用户填的是元（如 8000），则按 1000 折成 K。
 * @param {[number, number]} range - [min, max]，单位可能是 K 或 元
 * @returns {[number, number]} 统一为 K
 */
function normalizeSalaryRangeToK (range) {
  if (!Array.isArray(range) || range.length < 2) return [0, 0]
  let [min, max] = range
  if (min >= 100) min = min / 1000
  if (max >= 100) max = max / 1000
  return [min, max]
}

/** @typedef {'city'|'education'|'workExp'|'salary'|'skills'|'blockName'|'viewed'} FilterResultReason */

/**
 * 按 candidate-filter 配置筛选候选人
 * @param {Array<{ encryptGeekId?: string, geekName?: string, education?: string, workExp?: string, city?: string, jobTitle?: string, salary?: string, skills?: string, _hasViewed?: boolean }>} candidates
 * @param {{
 *   expectCityList?: string[],
 *   expectEducationRegExpStr?: string,
 *   expectEducationList?: string[],
 *   expectWorkExpRange?: [number, number],
 *   expectSalaryRange?: [number, number],
 *   expectSalaryWhenNegotiable?: 'exclude'|'include',
 *   expectSkillKeywords?: string[],
 *   blockCandidateNameRegExpStr?: string,
 *   skipViewedCandidates?: boolean
 * }} filterConfig
 * expectSalaryWhenNegotiable: 候选人薪资为"面议"或无法解析时：'exclude'=不通过，'include'=通过
 * @returns {{ matched: Array<{ candidate: object, filterResult: { matched: true } }>, skipped: Array<{ candidate: object, filterResult: { matched: false, reason: FilterResultReason } }> }}
 */
export function filterCandidates (candidates, filterConfig) {
  const {
    expectCityList = [],
    expectEducationRegExpStr = '',
    expectEducationList = [],
    expectWorkExpRange = [0, 99],
    expectSalaryRange = [0, 0],
    expectSalaryWhenNegotiable = 'exclude',
    expectSkillKeywords = [],
    blockCandidateNameRegExpStr = '',
    skipViewedCandidates = false
  } = filterConfig || {}

  const blockNameReg = blockCandidateNameRegExpStr
    ? new RegExp(blockCandidateNameRegExpStr, 'i')
    : null

  const matched = []
  const skipped = []

  for (const candidate of candidates) {
    const name = (candidate.geekName ?? '').trim()

    if (skipViewedCandidates && candidate._hasViewed) {
      skipped.push({
        candidate,
        filterResult: { matched: false, reason: 'viewed', reasonDetail: '已读候选人，已跳过' }
      })
      continue
    }

    if (blockNameReg && name && blockNameReg.test(name)) {
      skipped.push({
        candidate,
        filterResult: { matched: false, reason: 'blockName', reasonDetail: `姓名"${name}"命中屏蔽正则 ${blockCandidateNameRegExpStr}` }
      })
      continue
    }

    if (Array.isArray(expectCityList) && expectCityList.length) {
      const city = (candidate.city ?? '').trim()
      const cityMatched = expectCityList.some((c) => city.includes(c))
      if (!cityMatched) {
        skipped.push({
          candidate,
          filterResult: {
            matched: false,
            reason: 'city',
            reasonDetail: `期望城市 ${expectCityList.join('、')}，候选人 ${city || '未填'}`
          }
        })
        continue
      }
    }

    const educationRegExpStr = expectEducationRegExpStr ||
      (Array.isArray(expectEducationList) && expectEducationList.length ? expectEducationList.join('|') : '')
    if (educationRegExpStr) {
      const education = (candidate.education ?? '').trim()
      if (!education || !new RegExp(educationRegExpStr).test(education)) {
        skipped.push({
          candidate,
          filterResult: {
            matched: false,
            reason: 'education',
            reasonDetail: `期望学历匹配 /${educationRegExpStr}/，候选人 ${education || '未填'}`
          }
        })
        continue
      }
    }

    const workExpYears = parseWorkExpYears(candidate.workExp ?? '')
    if (workExpYears !== null && (workExpYears < expectWorkExpRange[0] || workExpYears > expectWorkExpRange[1])) {
      const [minY, maxY] = expectWorkExpRange
      skipped.push({
        candidate,
        filterResult: {
          matched: false,
          reason: 'workExp',
          reasonDetail: `期望工作年限 ${minY}-${maxY} 年，候选人 ${candidate.workExp ?? '未知'}（解析为 ${workExpYears} 年）`
        }
      })
      continue
    }

    const [salaryMinRaw, salaryMaxRaw] = expectSalaryRange
    const [salaryMin, salaryMax] = normalizeSalaryRangeToK([salaryMinRaw, salaryMaxRaw])
    if (salaryMin > 0 || salaryMax > 0) {
      const salaryData = parseSalaryRange(candidate.salary ?? '')
      const salaryStr = candidate.salary ?? '未填'
      if (salaryData) {
        const inRange = (salaryData.low <= salaryMax || salaryMax === 0) && (salaryData.high >= salaryMin || salaryMin === 0)
        if (!inRange) {
          skipped.push({
            candidate,
            filterResult: {
              matched: false,
              reason: 'salary',
              reasonDetail: `期望薪资 ${salaryMin}-${salaryMax}K，候选人 ${salaryStr}（约 ${salaryData.low}-${salaryData.high}K）`
            }
          })
          continue
        }
      } else {
        if (expectSalaryWhenNegotiable === 'include') {
          // 面议或无法解析时视为通过薪资条件
        } else {
          skipped.push({
            candidate,
            filterResult: {
              matched: false,
              reason: 'salary',
              reasonDetail: `期望薪资 ${salaryMin}-${salaryMax}K，候选人 ${salaryStr}（面议/无法解析，当前策略：不通过）`
            }
          })
          continue
        }
      }
    }

    if (Array.isArray(expectSkillKeywords) && expectSkillKeywords.length) {
      const skills = (candidate.skills ?? '').toLowerCase()
      const hasMatch = expectSkillKeywords.some((kw) => skills.includes((kw ?? '').toLowerCase()))
      if (!hasMatch) {
        skipped.push({
          candidate,
          filterResult: {
            matched: false,
            reason: 'skills',
            reasonDetail: `期望技能关键词 ${expectSkillKeywords.join('、')}，候选人技能/优势中未匹配`
          }
        })
        continue
      }
    }

    matched.push({
      candidate,
      filterResult: { matched: true }
    })
  }

  return { matched, skipped }
}

/**
 * 滚动页面以加载更多候选人；检测是否已到底部（如“没有更多”提示）。
 * 使用拟人滚轮：page.mouse.wheel() 小步、随机延迟，替代一次性 window.scrollBy，以规避 BOSS 滚动埋点。
 *
 * @param { import('puppeteer').Page } page
 * @returns { Promise<boolean> } true 表示还有更多数据可加载，false 表示已到底
 */
export async function scrollAndLoadMore (page) {
  const listSelector = CANDIDATE_LIST_SELECTOR
  const maxScrolls = 3
  const stepsPerScroll = 4
  const baseDelta = 25
  const deltaRandom = 15

  try {
    for (let i = 0; i < maxScrolls; i++) {
      for (let s = 0; s < stepsPerScroll; s++) {
        const deltaY = baseDelta + Math.floor(deltaRandom * Math.random())
        await page.mouse.wheel({ deltaY })
        await sleep(80 + Math.floor(80 * Math.random()))
      }
    }

    const hasMore = await page.evaluate((selector) => {
      const hasMoreText = /没有更多|已经到底|加载完毕|暂无更多/i.test(document.body?.innerText ?? '')
      if (hasMoreText) return false
      if (selector) {
        const el = document.querySelector(selector)
        const vueHasMore = el?.__vue__?.hasMore ?? el?.__vue__?.$data?.hasMore
        if (vueHasMore === false) return false
      }
      return true
    }, listSelector)

    return hasMore
  } catch (err) {
    logWarn('[candidate-processor] scrollAndLoadMore 失败:', err.message)
    return false
  }
}

/**
 * 翻页（若招聘端为分页而非无限滚动）。
 * 使用拟人轨迹点击"下一页"按钮，规避 BOSS 鼠标埋点。
 *
 * @param { import('puppeteer').Page } page
 * @param {{ cursor?: object }} [options] - 可选拟人光标，不传则内部创建
 * @returns { Promise<boolean> } 是否成功翻到下一页
 */
export async function navigateToNextPage (page, options = {}) {
  try {
    const hasNext = await page.evaluate((sel) => {
      const nextBtn = document.querySelector(sel)
      return !!(nextBtn && !nextBtn.classList?.contains?.('disabled'))
    }, NEXT_PAGE_BUTTON_SELECTOR)
    if (!hasNext) return false

    const cursor = options.cursor ?? await createHumanCursor(page)
    await cursor.click(NEXT_PAGE_BUTTON_SELECTOR)
    await sleep(1500)
    return true
  } catch (err) {
    logWarn('[candidate-processor] navigateToNextPage 失败:', err.message)
    return false
  }
}
