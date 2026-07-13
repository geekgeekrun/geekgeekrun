import cheerio from 'cheerio'

const JOB_DETAIL = 'https://www.zhipin.com/wapi/zpgeek/job/detail.json'
const NEGATIVE_REASONS = 'https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json'
const NEGATIVE_SAVE = 'https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json'
const FRIEND_ADD = 'https://www.zhipin.com/wapi/zpgeek/friend/add.json'
const HISTORY = 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg'

export function messageForSaveFilter(item) {
  return item.status !== 3 && item.templateId === 1 &&
    ((['text', 'sticker', 'image', 'sound', 'comDesc'].includes(item.messageType) && !item.extend?.greetingQuestionAnswer) ||
      (item.messageType === 'dialog' && [0, 1, 2, 8, 11, 12, 14, 17, 33].includes(item.dialog?.type)))
}

async function currentJobSource(page) {
  const checks = [
    ['recommend', async () => page.evaluate(({ selector }) => document.querySelector(selector).classList.contains('active'), { selector: '.c-expect-select a[ka="jobs_recommend_tab_click"]' })],
    ['expect', async () => page.evaluate(({ selector }) => [...document.querySelectorAll(selector)].some((el) => el.classList.contains('active')), { selector: '.c-expect-select .expect-list .expect-item' })],
    ['search', async () => Boolean(await page.$('.page-jobs-main')?.then((handle) => handle?.evaluate((el) => el?.__vue__?.formData?.query)))]
  ]
  for (const [name, check] of checks) { try { if (await check()) return name } catch {} }
  return null
}

function mapMessages(items, currentUser, boss) {
  return items.filter(messageForSaveFilter).map((item) => ({
    mid: item.mid,
    encryptFromUserId: item.isSelf ? currentUser.encryptUserId : boss.encryptBossId,
    encryptToUserId: item.isSelf ? boss.encryptBossId : currentUser.encryptUserId,
    style: item.isSelf ? 'sent' : 'received', type: item.type,
    time: item.time ? new Date(item.time) : null, text: item.text,
    ...(item.type === 'image' ? {
      imageUrl: item.image?.originImage?.url,
      imageHeight: item.image?.originImage?.height,
      imageWidth: item.image?.originImage?.width
    } : {})
  }))
}

export function createBossPageListener({ page, storage, records, reporter = { emit() {} } }) {
  const inspectJobDetail = async (encryptJobId) => {
    if (!encryptJobId) return
    try {
      await page.waitForFunction(({ encryptJobId: id }) =>
        location.href.startsWith(`https://www.zhipin.com/job_detail/${id}`) &&
        (Boolean(document.querySelector('#main .job-banner')) || document.documentElement.innerText?.includes('您访问的页面不存在')),
      undefined, { encryptJobId })
      const html = await page.content()
      const $ = cheerio.load(html)
      const status = $('#main .job-banner .job-status').text()?.trim()
      const hireStatus = !$('#main .job-banner').length
        ? (html.includes('您访问的页面不存在') || page.url() === 'https://www.zhipin.com/' ? 3 : null)
        : (status === '职位已关闭' ? 2 : 1)
      if (hireStatus) await records.saveHireStatus?.({ encryptJobId, hireStatus })
    } catch {}
  }
  const detailId = (url) => url.match(/^https:\/\/www\.zhipin\.com\/job_detail\/(.+)\.html/)?.[1]
  const onResponse = async (response) => {
    const responseUrl = response.url()
    try {
      if (detailId(responseUrl)) {
        await inspectJobDetail(detailId(responseUrl))
      } else if (responseUrl.startsWith(JOB_DETAIL)) {
        const data = await response.json()
        if (data.code === 0) {
          await records.saveJobInfo?.(data.zpData)
          await records.saveHireStatus?.({ encryptJobId: data.zpData.jobInfo.encryptId, hireStatus: 1 })
        }
      } else if (responseUrl.startsWith(NEGATIVE_REASONS)) {
        const cache = await storage.readReasonCache()
        for (const item of (await response.json())?.zpData?.result ?? []) cache[item.code] = item.text?.content ?? ''
        await storage.writeReasonCache(cache)
      } else if (page.url().startsWith('https://www.zhipin.com/web/geek/jobs') && responseUrl.startsWith(NEGATIVE_SAVE)) {
        const job = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
        const user = await page.evaluate('document.querySelector(".job-detail-box").__vue__.$store.state.userInfo')
        const body = new URLSearchParams(response.request().postData())
        if (body.get('securityId') !== job?.securityId) return
        const cache = await storage.readReasonCache()
        const code = Number(body.get('code'))
        await records.saveNotSuitable?.({ job, user, code, reason: cache[code], jobSource: await currentJobSource(page) })
      } else if (page.url().startsWith('https://www.zhipin.com/web/geek/jobs') && responseUrl.startsWith(FRIEND_ADD)) {
        const job = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
        if (new URL(response.request().url()).searchParams.get('jobId') !== job?.jobInfo?.encryptId) return
        const user = await page.evaluate('document.querySelector(".job-detail-box").__vue__.$store.state.userInfo')
        await records.saveChatStartup?.({ job, user, jobSource: await currentJobSource(page) })
      } else if (page.url().startsWith('https://www.zhipin.com/web/geek/chat') && responseUrl.startsWith(HISTORY)) {
        const user = await page.evaluate('document.querySelector(".main-wrap").__vue__.$store.state.userInfo')
        const boss = await page.evaluate('document.querySelector(".chat-conversation .chat-record")?.__vue__?.boss')
        if (!boss) return
        await records.saveBoss?.(boss)
        if (new URL(response.request().url()).searchParams.get('bossId') !== boss.encryptBossId) return
        const messages = await page.evaluate('document.querySelector(".message-content .chat-record").__vue__.list$') ?? []
        await records.saveChatMessages?.(mapMessages(messages, user, boss))
      }
    } catch (error) {
      reporter.emit('task.progress', { state: 'listener-failed', code: error?.code ?? 'BROWSER_LISTENER_FAILED', message: error?.message ?? String(error) })
    }
  }
  page.on('response', onResponse)
  if (detailId(page.url())) void inspectJobDetail(detailId(page.url()))
  return () => page.off?.('response', onResponse)
}
