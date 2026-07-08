import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentService } from '../lib/agent-service.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-mcp-'))
const queueFilePath = path.join(tempDir, 'hr-reply-approval-queue.json')
await fs.writeFile(queueFilePath, JSON.stringify([
  { id: 'pending-1', status: 'pending', draftReply: '您好，可以继续聊', latestHrMessage: '方便聊吗' },
  { id: 'sent-1', status: 'auto_reply_sent', draftReply: '已发送', latestHrMessage: '你好' }
], null, 2))
const service = createAgentService({ approvalQueueFilePath: queueFilePath })
const status = service.getStatus()

assert.equal(status.running, false)
assert.equal(status.pid, null)

const pendingApprovals = await service.listAiReplyApprovals()
assert.equal(pendingApprovals.length, 1)
assert.equal(pendingApprovals[0].id, 'pending-1')
assert.equal(pendingApprovals[0].status, 'pending')

const allApprovals = await service.listAiReplyApprovals({ includeAll: true })
assert.equal(allApprovals.length, 2)

const approved = await service.approveAutoReply({ id: 'pending-1' })
assert.equal(approved.status, 'approved_auto_reply')

await fs.writeFile(queueFilePath, JSON.stringify([
  { id: 'pending-2', status: 'pending', draftReply: '我来人工处理', latestHrMessage: '能接受薪资吗' }
], null, 2))
const humanRequired = await service.requireHumanIntervention({ id: 'pending-2', reason: 'needs owner review' })
assert.equal(humanRequired.status, 'human_required')
assert.equal(humanRequired.reviewReason, 'needs owner review')
assert.equal('ensureHeadlessPatch' in service, false, 'agent service must not mutate source files to enable headless mode')

await assert.rejects(
  service.updateConfig({ fileName: 'secrets.json', patch: {} }),
  /Unsupported config file/
)

const coreSource = await read('packages/geek-auto-start-chat-with-boss/index.mjs')
assert.match(coreSource, /headless:\s*process\.env\.GGR_HEADLESS\s*===\s*['"]true['"]/, 'core must read headless mode from GGR_HEADLESS')
assert.doesNotMatch(coreSource, /headless:\s*false/, 'core must not hard-code visible browser mode')

const agentSource = await read('packages/ggr-mcp/lib/agent-service.mjs')
assert.match(agentSource, /ggr-controller\/index\.mjs/, 'ggr-mcp agent service must use the shared controller package')
assert.match(agentSource, /createLocalProcessController/, 'ggr-mcp agent service must create a local process controller')
assert.match(agentSource, /readApprovalQueue/, 'ggr-mcp agent service must expose user-level approval queue reads')
assert.match(agentSource, /approveAutoReply/, 'ggr-mcp agent service must expose approving AI auto replies')
assert.match(agentSource, /requireHumanIntervention/, 'ggr-mcp agent service must expose marking replies for human intervention')
assert.doesNotMatch(agentSource, /markAutoReplySent/, 'ggr-mcp must not expose worker-only sent status mutation')
assert.doesNotMatch(agentSource, /markAutoReplyFailed/, 'ggr-mcp must not expose worker-only failure status mutation')
assert.doesNotMatch(agentSource, /markAutoReplyExpired/, 'ggr-mcp must not expose worker-only expiry status mutation')
assert.doesNotMatch(agentSource, /ensureHeadlessPatch/, 'ggr-mcp must not patch source files at runtime')
assert.doesNotMatch(agentSource, /source\.replace\(['"]headless:\s*false/, 'ggr-mcp must not rewrite Puppeteer source')

const serverSource = await read('packages/ggr-mcp/server.mjs')
assert.match(serverSource, /boss_list_ai_reply_approvals/, 'ggr-mcp must expose listing AI reply approvals to Hermes')
assert.match(serverSource, /boss_approve_auto_reply/, 'ggr-mcp must expose allowing AI auto replies to Hermes')
assert.match(serverSource, /boss_require_human_intervention/, 'ggr-mcp must expose manual handoff to Hermes')
assert.doesNotMatch(serverSource, /markAutoReplySent|markAutoReplyFailed|markAutoReplyExpired/, 'ggr-mcp server must not expose worker-only status mutations')

console.log('ggr-mcp check passed')
