import { buildAutoReply, buildReviewDraft, classifyHrMessage, HR_REPLY_DECISION, validateAutoReply } from './reply-policy.mjs'

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const sameField = (expected, actual) => !normalize(expected) || !normalize(actual) || normalize(expected) === normalize(actual)

export async function consumeApprovedAutoReply({ latestMessage, context = {}, operations }) {
  const latestText = normalize(latestMessage?.text)
  if (!latestMessage || latestMessage.isSelf || !latestText) return false
  const approvals = await operations.listApprovals({ includeAll: true })
  const approval = approvals.find((item) => item.status === 'approved_auto_reply' &&
    sameField(item.hrName, context.hrName) && sameField(item.company, context.company) && sameField(item.jobTitle, context.jobTitle))
  if (!approval) return false
  if (normalize(approval.latestHrMessage) !== latestText) {
    await operations.markApproval(approval.id, 'auto_reply_expired', 'latest HR message changed before worker could send approved reply')
    return true
  }
  const draft = normalize(approval.draftReply)
  if (!draft) {
    await operations.markApproval(approval.id, 'auto_reply_failed', 'approved draft is empty before send')
    return true
  }
  try {
    await operations.sendMessage(draft)
    await operations.markApproval(approval.id, 'auto_reply_sent')
  } catch (error) {
    await operations.markApproval(approval.id, 'auto_reply_failed', error instanceof Error ? error.message : String(error))
  }
  return true
}

export async function handleLatestHrMessage({ latestMessage, historyMessages = [], context = {}, policy, operations }) {
  if (!latestMessage || latestMessage.isSelf) return { action: 'ignored' }
  const latestHrMessage = normalize(latestMessage.text)
  const classification = classifyHrMessage(latestHrMessage, policy)
  const autoReply = buildAutoReply(classification, context)
  const validation = autoReply ? validateAutoReply(autoReply) : { ok: false, reason: 'no auto reply draft' }
  if (classification.decision === HR_REPLY_DECISION.AUTO_REPLY && validation.ok) {
    await operations.sendMessage(autoReply)
    return { action: 'auto-replied', classification }
  }
  if (classification.decision !== HR_REPLY_DECISION.NEEDS_APPROVAL) return { action: 'ignored', classification }
  let reviewDraft = ''
  let reviewDraftReason = ''
  try { reviewDraft = buildReviewDraft(classification, await operations.requestReviewDraft(historyMessages)) }
  catch (error) { reviewDraftReason = `model review draft failed: ${error instanceof Error ? error.message : String(error)}` }
  await operations.appendApprovalRequest({
    hrName: context.hrName ?? '', company: context.company ?? '', jobTitle: context.jobTitle ?? '', latestHrMessage,
    detectedIntent: classification.intent, draftReply: reviewDraft,
    draftSource: reviewDraft ? 'model_review_draft' : 'none', draftSafety: 'needs_human_review',
    reason: [classification.reason, reviewDraftReason].filter(Boolean).join('; ')
  })
  return { action: 'approval-required', classification }
}
