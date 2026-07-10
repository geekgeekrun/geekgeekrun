import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const policy = await import('../src/main/features/hr-reply-policy.mjs')

const {
  HR_REPLY_DECISION,
  HR_REPLY_INTENT,
  classifyHrMessage,
  buildAutoReply,
  buildReviewDraft,
  validateAutoReply,
  appendApprovalRequest,
  getPendingApprovalRequests
} = policy

function assertAuto(message, intent) {
  const result = classifyHrMessage(message)
  assert.equal(result.decision, HR_REPLY_DECISION.AUTO_REPLY, message)
  assert.equal(result.intent, intent, message)
  const reply = buildAutoReply(result, { userName: 'Toby' })
  const validation = validateAutoReply(reply)
  assert.equal(validation.ok, true, `${message} => ${reply}`)
}

function assertApproval(message, intent = HR_REPLY_INTENT.UNKNOWN) {
  const result = classifyHrMessage(message)
  assert.equal(result.decision, HR_REPLY_DECISION.NEEDS_APPROVAL, message)
  assert.equal(result.intent, intent, message)
  assert.equal(buildAutoReply(result), '', 'approval-required messages must not use whitelist auto replies')
  assert.equal(buildReviewDraft(result, '可以沟通，我这边需要再确认一下细节。'), '可以沟通，我这边需要再确认一下细节。')
}

assertAuto('方便发一份简历吗？', HR_REPLY_INTENT.ASK_RESUME)
assertAuto('可以简单介绍一下自己吗', HR_REPLY_INTENT.ASK_SELF_INTRO)
assertAuto('你现在还在看机会吗？', HR_REPLY_INTENT.ASK_JOB_SEARCH_STATUS)
assertAuto('现在方便沟通一下吗', HR_REPLY_INTENT.ASK_AVAILABLE_TO_CHAT)
assertAuto('ok，现在方便沟通吗', HR_REPLY_INTENT.ASK_AVAILABLE_TO_CHAT)

assertApproval('你的期望薪资是多少？', HR_REPLY_INTENT.ASK_SALARY)
assertApproval('期望 15k 可以吗？', HR_REPLY_INTENT.ASK_SALARY)
assertApproval('明天下午三点可以面试吗？', HR_REPLY_INTENT.ASK_INTERVIEW_TIME)
assertApproval('发一下手机号和邮箱吧', HR_REPLY_INTENT.ASK_PRIVATE_INFO)
assertApproval('你这个SOC项目具体怎么做的？', HR_REPLY_INTENT.ASK_PROJECT_DETAIL)
assertApproval('能接受外包驻场和加班吗？', HR_REPLY_INTENT.ASK_OUTSOURCING_OR_ONSITE)
assertApproval('为什么离职？', HR_REPLY_INTENT.ASK_REASON_FOR_LEAVING)
assertApproval('你这边是什么情况？')

assert.equal(validateAutoReply('我的手机号是13800138000').ok, false)
assert.equal(validateAutoReply('期望薪资15k').ok, false)
assert.equal(validateAutoReply('明天下午三点可以面试').ok, false)
assert.equal(validateAutoReply('我是资深专家，保证能胜任').ok, false)

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-approval-'))
const queueFilePath = path.join(tmpDir, 'approval-queue.json')

const request = {
  hrName: '张三',
  company: '测试公司',
  jobTitle: 'SOC分析师',
  latestHrMessage: '你的期望薪资是多少？',
  detectedIntent: HR_REPLY_INTENT.ASK_SALARY,
  draftReply: '薪资我这边想先了解岗位预算。',
  draftSource: 'model_review_draft',
  draftSafety: 'needs_human_review',
  reason: 'salary requires approval'
}

const first = await appendApprovalRequest(request, { queueFilePath })
assert.equal(first.created, true)
assert.equal(first.request.status, 'pending')

const second = await appendApprovalRequest(request, { queueFilePath })
assert.equal(second.created, false)
assert.equal(second.request.id, first.request.id)

const pending = await getPendingApprovalRequests({ queueFilePath })
assert.equal(pending.length, 1)
assert.equal(pending[0].latestHrMessage, request.latestHrMessage)
assert.equal(pending[0].draftSource, 'model_review_draft')
assert.equal(pending[0].draftSafety, 'needs_human_review')

const concurrentQueueFilePath = path.join(tmpDir, 'concurrent-approval-queue.json')
await Promise.all(
  Array.from({ length: 12 }, (_, index) =>
    appendApprovalRequest(
      {
        ...request,
        hrName: `招聘者${index}`,
        latestHrMessage: `审批消息${index}`
      },
      { queueFilePath: concurrentQueueFilePath }
    )
  )
)
const concurrentPending = await getPendingApprovalRequests({ queueFilePath: concurrentQueueFilePath })
assert.equal(concurrentPending.length, 12)

console.log('hr reply policy check passed')
