import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

export const HR_REPLY_DECISION = Object.freeze({
  AUTO_REPLY: 'AUTO_REPLY',
  NEEDS_APPROVAL: 'NEEDS_APPROVAL',
  IGNORE: 'IGNORE'
})

export const HR_REPLY_INTENT = Object.freeze({
  ASK_RESUME: 'ASK_RESUME',
  ASK_SELF_INTRO: 'ASK_SELF_INTRO',
  ASK_JOB_SEARCH_STATUS: 'ASK_JOB_SEARCH_STATUS',
  ASK_AVAILABLE_TO_CHAT: 'ASK_AVAILABLE_TO_CHAT',
  ASK_SALARY: 'ASK_SALARY',
  ASK_AVAILABILITY_DATE: 'ASK_AVAILABILITY_DATE',
  ASK_INTERVIEW_TIME: 'ASK_INTERVIEW_TIME',
  ASK_PRIVATE_INFO: 'ASK_PRIVATE_INFO',
  ASK_PROJECT_DETAIL: 'ASK_PROJECT_DETAIL',
  ASK_WORK_HISTORY: 'ASK_WORK_HISTORY',
  ASK_CREDENTIALS: 'ASK_CREDENTIALS',
  ASK_LOCATION_OR_RELOCATION: 'ASK_LOCATION_OR_RELOCATION',
  ASK_OUTSOURCING_OR_ONSITE: 'ASK_OUTSOURCING_OR_ONSITE',
  ASK_OVERTIME_OR_SHIFT: 'ASK_OVERTIME_OR_SHIFT',
  ASK_REASON_FOR_LEAVING: 'ASK_REASON_FOR_LEAVING',
  UNKNOWN: 'UNKNOWN'
})

export const DEFAULT_HR_REPLY_POLICY = Object.freeze({
  enabled: true,
  mode: 'whitelist',
  autoReplyConfidenceThreshold: 0.85,
  allowedIntents: Object.freeze([
    HR_REPLY_INTENT.ASK_RESUME,
    HR_REPLY_INTENT.ASK_SELF_INTRO,
    HR_REPLY_INTENT.ASK_JOB_SEARCH_STATUS,
    HR_REPLY_INTENT.ASK_AVAILABLE_TO_CHAT
  ]),
  requireApprovalIntents: Object.freeze([
    HR_REPLY_INTENT.ASK_SALARY,
    HR_REPLY_INTENT.ASK_AVAILABILITY_DATE,
    HR_REPLY_INTENT.ASK_INTERVIEW_TIME,
    HR_REPLY_INTENT.ASK_PRIVATE_INFO,
    HR_REPLY_INTENT.ASK_PROJECT_DETAIL,
    HR_REPLY_INTENT.ASK_WORK_HISTORY,
    HR_REPLY_INTENT.ASK_CREDENTIALS,
    HR_REPLY_INTENT.ASK_LOCATION_OR_RELOCATION,
    HR_REPLY_INTENT.ASK_OUTSOURCING_OR_ONSITE,
    HR_REPLY_INTENT.ASK_OVERTIME_OR_SHIFT,
    HR_REPLY_INTENT.ASK_REASON_FOR_LEAVING,
    HR_REPLY_INTENT.UNKNOWN
  ])
})

const unsafeRules = [
  [HR_REPLY_INTENT.ASK_SALARY, /薪资|薪水|工资|待遇|期望薪|多少钱|底薪|base|package|\d+\s*[kK]\b/],
  [HR_REPLY_INTENT.ASK_INTERVIEW_TIME, /面试|约面|一面|二面|终面|几点|上午|下午|晚上|明天|后天|周一|周二|周三|周四|周五|周六|周日|星期|时间/],
  [HR_REPLY_INTENT.ASK_AVAILABILITY_DATE, /到岗|入职|离职了吗|什么时候能来|最快.*来|多久.*到|available|availability/],
  [HR_REPLY_INTENT.ASK_PRIVATE_INFO, /手机号|电话|微信|邮箱|联系方式|加微|v信|VX|wechat|email|mail/iu],
  [HR_REPLY_INTENT.ASK_PROJECT_DETAIL, /项目.*(细节|具体|怎么|架构|难点|负责|做了)|SOC.*(怎么|具体)|经历.*具体|展开讲|详细说/],
  [HR_REPLY_INTENT.ASK_WORK_HISTORY, /上一份|上家公司|工作经历|实习经历|做过什么|几年经验|工作年限|gap/],
  [HR_REPLY_INTENT.ASK_CREDENTIALS, /学历|证书|四六级|CET|成绩|绩点|GPA|毕业证|学位证|专业/iu],
  [HR_REPLY_INTENT.ASK_LOCATION_OR_RELOCATION, /在哪|哪里人|目前.*城市|搬|异地|通勤|base地|地点|地址|relocation/],
  [HR_REPLY_INTENT.ASK_OUTSOURCING_OR_ONSITE, /外包|驻场|派遣|乙方|客户现场|onsite|外派/iu],
  [HR_REPLY_INTENT.ASK_OVERTIME_OR_SHIFT, /加班|夜班|倒班|轮班|大小周|单双休|出差|996|值班/],
  [HR_REPLY_INTENT.ASK_REASON_FOR_LEAVING, /为什么.*离职|离职原因|离开.*原因|为什么不做|为什么换/]
]

const safeRules = [
  [HR_REPLY_INTENT.ASK_RESUME, /简历|履历|cv|resume|发一份|投递材料/iu],
  [HR_REPLY_INTENT.ASK_SELF_INTRO, /自我介绍|介绍.*自己|简单介绍|说一下自己|介绍一下/],
  [HR_REPLY_INTENT.ASK_JOB_SEARCH_STATUS, /还在(看|找).*机会|还找工作|还在求职|还在看吗|是否还在|还考虑|还感兴趣/],
  [HR_REPLY_INTENT.ASK_AVAILABLE_TO_CHAT, /方便(沟通|聊|交流)|现在.*方便|可以聊|有空聊|在线吗|在吗/]
]

const templateByIntent = {
  [HR_REPLY_INTENT.ASK_RESUME]: '您好，可以的，我这边简历已整理好，方便的话我可以发送给您。',
  [HR_REPLY_INTENT.ASK_SELF_INTRO]: '您好，我是{userName}，近期关注网络安全、SOC和IT技术支持相关机会，期待进一步沟通。',
  [HR_REPLY_INTENT.ASK_JOB_SEARCH_STATUS]: '您好，还在看合适机会，方便的话可以进一步沟通岗位情况。',
  [HR_REPLY_INTENT.ASK_AVAILABLE_TO_CHAT]: '您好，方便的，您可以先发岗位信息，我这边看一下。'
}

function normalizeMessage(message) {
  return String(message ?? '').replace(/\s+/g, ' ').trim()
}

function mergePolicy(policy = {}) {
  return {
    ...DEFAULT_HR_REPLY_POLICY,
    ...policy,
    allowedIntents: policy.allowedIntents ?? DEFAULT_HR_REPLY_POLICY.allowedIntents,
    requireApprovalIntents: policy.requireApprovalIntents ?? DEFAULT_HR_REPLY_POLICY.requireApprovalIntents
  }
}

function matchRule(message, rules) {
  return rules.find(([, regexp]) => regexp.test(message)) ?? null
}

export function classifyHrMessage(message, policy = {}) {
  const text = normalizeMessage(message)
  const effectivePolicy = mergePolicy(policy)

  if (!effectivePolicy.enabled || !text) {
    return {
      decision: HR_REPLY_DECISION.IGNORE,
      intent: HR_REPLY_INTENT.UNKNOWN,
      confidence: 1,
      reason: 'policy disabled or empty message'
    }
  }

  const unsafeMatch = matchRule(text, unsafeRules)
  if (unsafeMatch) {
    return {
      decision: HR_REPLY_DECISION.NEEDS_APPROVAL,
      intent: unsafeMatch[0],
      confidence: 1,
      reason: 'matched unsafe approval-required rule'
    }
  }

  const safeMatch = matchRule(text, safeRules)
  if (safeMatch && effectivePolicy.allowedIntents.includes(safeMatch[0])) {
    return {
      decision: HR_REPLY_DECISION.AUTO_REPLY,
      intent: safeMatch[0],
      confidence: 1,
      reason: 'matched whitelist auto-reply rule'
    }
  }

  return {
    decision: HR_REPLY_DECISION.NEEDS_APPROVAL,
    intent: HR_REPLY_INTENT.UNKNOWN,
    confidence: 0,
    reason: 'unknown or ambiguous message requires approval'
  }
}

export function buildAutoReply(classification, context = {}) {
  if (classification?.decision !== HR_REPLY_DECISION.AUTO_REPLY) {
    return ''
  }

  const template = templateByIntent[classification.intent]
  if (!template) {
    return ''
  }

  const userName = String(context.userName ?? 'Toby').trim() || 'Toby'
  return template.replaceAll('{userName}', userName)
}

export function buildReviewDraft(classification, draftText) {
  if (classification?.decision !== HR_REPLY_DECISION.NEEDS_APPROVAL) {
    return ''
  }
  return normalizeMessage(draftText)
}

export function validateAutoReply(text) {
  const reply = normalizeMessage(text)
  const rejectionRules = [
    [/1[3-9]\d{9}/, 'phone number is not allowed'],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu, 'email is not allowed'],
    [/(期望薪|薪资|薪水|工资|待遇|\d+\s*[kK]|\d+万)/, 'salary content is not allowed'],
    [/(面试|明天|后天|上午|下午|晚上|\d+点|周一|周二|周三|周四|周五|周六|周日|星期)/, 'interview time commitment is not allowed'],
    [/(到岗|入职|离职|随时到|马上到)/, 'availability commitment is not allowed'],
    [/(专家|资深|保证|一定|绝对|必须)/, 'unsupported or aggressive claim is not allowed']
  ]

  if (reply.length < 4 || reply.length > 120) {
    return { ok: false, reason: 'reply length is outside safe range' }
  }

  const rejected = rejectionRules.find(([regexp]) => regexp.test(reply))
  if (rejected) {
    return { ok: false, reason: rejected[1] }
  }

  return { ok: true, reason: '' }
}

function defaultQueueFilePath() {
  return path.join(os.homedir(), '.geekgeekrun', 'storage', 'hr-reply-approval-queue.json')
}

async function readQueue(queueFilePath) {
  try {
    const data = JSON.parse(await fs.readFile(queueFilePath, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function writeQueue(queueFilePath, queue) {
  await fs.mkdir(path.dirname(queueFilePath), { recursive: true, mode: 0o700 })
  await fs.writeFile(queueFilePath, `${JSON.stringify(queue, null, 2)}\n`, { mode: 0o600 })
  await fs.chmod(queueFilePath, 0o600).catch(() => {})
}

function requestDedupeKey(request) {
  return createHash('sha256')
    .update([
      request.hrName ?? '',
      request.company ?? '',
      request.jobTitle ?? '',
      request.latestHrMessage ?? ''
    ].join('\n'))
    .digest('hex')
}

export async function appendApprovalRequest(request, options = {}) {
  const queueFilePath = options.queueFilePath ?? defaultQueueFilePath()
  const queue = await readQueue(queueFilePath)
  const dedupeKey = request.dedupeKey ?? requestDedupeKey(request)
  const existing = queue.find((item) => item.dedupeKey === dedupeKey && item.status === 'pending')

  if (existing) {
    return { created: false, request: existing }
  }

  const nextRequest = {
    id: request.id ?? randomUUID(),
    dedupeKey,
    createdAt: request.createdAt ?? new Date().toISOString(),
    hrName: request.hrName ?? '',
    company: request.company ?? '',
    jobTitle: request.jobTitle ?? '',
    latestHrMessage: request.latestHrMessage ?? '',
    detectedIntent: request.detectedIntent ?? HR_REPLY_INTENT.UNKNOWN,
    draftReply: request.draftReply ?? '',
    draftSource: request.draftSource ?? (request.draftReply ? 'model_review_draft' : 'none'),
    draftSafety: request.draftSafety ?? 'needs_human_review',
    reason: request.reason ?? '',
    status: request.status ?? 'pending'
  }

  queue.push(nextRequest)
  await writeQueue(queueFilePath, queue)
  return { created: true, request: nextRequest }
}

export async function getPendingApprovalRequests(options = {}) {
  const queueFilePath = options.queueFilePath ?? defaultQueueFilePath()
  const queue = await readQueue(queueFilePath)
  return queue.filter((item) => item.status === 'pending')
}
