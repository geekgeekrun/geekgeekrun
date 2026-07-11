import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createAgentService } from '../lib/agent-service.mjs'
import { createMcpServer } from '../lib/mcp-stdio.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function readJsonLine(stream, timeoutMs = 250) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for newline-delimited MCP response')), timeoutMs)
    stream.once('data', (chunk) => {
      clearTimeout(timeout)
      resolve(JSON.parse(chunk.toString().trim()))
    })
  })
}

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

const protocolInput = new PassThrough()
const protocolOutput = new PassThrough()
createMcpServer({ name: 'ggr-mcp-test', version: '0.1.0', tools: [] }).start({
  input: protocolInput,
  output: protocolOutput
})
const initializeResponsePromise = readJsonLine(protocolOutput)
protocolInput.write(`${JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05' }
})}\n`)
const initializeResponse = await initializeResponsePromise
assert.equal(initializeResponse.id, 1)
assert.equal(initializeResponse.result.serverInfo.name, 'ggr-mcp-test')

let validatedToolCallCount = 0
const validationInput = new PassThrough()
const validationOutput = new PassThrough()
createMcpServer({
  name: 'ggr-mcp-validation-test',
  version: '0.1.0',
  tools: [{
    name: 'validated_tool',
    description: 'test tool',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        mode: { type: 'string', enum: ['auto'] }
      },
      required: ['enabled', 'mode'],
      additionalProperties: false
    },
    handler: (args) => {
      validatedToolCallCount++
      return args
    }
  }]
}).start({ input: validationInput, output: validationOutput })

async function callValidatedTool(id, args) {
  const responsePromise = readJsonLine(validationOutput)
  validationInput.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'validated_tool', arguments: args }
  })}\n`)
  return responsePromise
}

for (const [id, args] of [
  [2, { enabled: 'false', mode: 'auto' }],
  [3, { enabled: false }],
  [4, { enabled: false, mode: 'manual' }],
  [5, { enabled: false, mode: 'auto', extra: true }]
]) {
  const invalidResponse = await callValidatedTool(id, args)
  assert.equal(invalidResponse.result.isError, true)
}
assert.equal(validatedToolCallCount, 0)
const validResponse = await callValidatedTool(6, { enabled: false, mode: 'auto' })
assert.equal(validResponse.result.isError, undefined)
assert.equal(validatedToolCallCount, 1)

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-mcp-'))
const queueFilePath = path.join(tempDir, 'hr-reply-approval-queue.json')
const configDir = path.join(tempDir, 'config')
await fs.mkdir(configDir, { recursive: true })
await fs.writeFile(path.join(configDir, 'boss.json'), JSON.stringify({ openingMessage: 'hello mcp', nested: { keep: true } }, null, 2))
await fs.writeFile(queueFilePath, JSON.stringify([
  { id: 'pending-1', status: 'pending', draftReply: '您好，可以继续聊', latestHrMessage: '方便聊吗' },
  { id: 'sent-1', status: 'auto_reply_sent', draftReply: '已发送', latestHrMessage: '你好' }
], null, 2))
const service = createAgentService({ approvalQueueFilePath: queueFilePath, configDir })
const status = service.getStatus()

assert.equal(status.running, false)
assert.equal(status.pid, null)

const mcpOpeningData = await service.readAppData({ resource: 'opening_message' })
assert.equal(mcpOpeningData.data.openingMessage, 'hello mcp')
const updatedMcpOpening = await service.updateAppData({ resource: 'opening_message', patch: { openingMessage: 'hello mcp updated' } })
assert.equal(updatedMcpOpening.data.openingMessage, 'hello mcp updated')
assert.equal(updatedMcpOpening.data.nested.keep, true)

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
  service.updateConfig({ fileName: 'unsupported.json', patch: {} }),
  /Unsupported config file/
)

const coreSource = await read('packages/geek-auto-start-chat-with-boss/index.mjs')
assert.match(coreSource, /headless:\s*process\.env\.GGR_HEADLESS\s*===\s*['"]true['"]/, 'core must read headless mode from GGR_HEADLESS')
assert.doesNotMatch(coreSource, /headless:\s*false/, 'core must not hard-code visible browser mode')

const agentSource = await read('packages/ggr-mcp/lib/agent-service.mjs')
assert.match(agentSource, /ggr-controller\/index\.mjs/, 'ggr-mcp agent service must use the shared controller package')
assert.match(agentSource, /createLocalProcessController/, 'ggr-mcp agent service must create a local process controller')
assert.match(agentSource, /readAppData/, 'ggr-mcp agent service must expose app-data reads')
assert.match(agentSource, /updateAppData/, 'ggr-mcp agent service must expose app-data updates')
assert.match(agentSource, /readApprovalQueue/, 'ggr-mcp agent service must expose user-level approval queue reads')
assert.match(agentSource, /approveAutoReply/, 'ggr-mcp agent service must expose approving AI auto replies')
assert.match(agentSource, /requireHumanIntervention/, 'ggr-mcp agent service must expose marking replies for human intervention')
assert.doesNotMatch(agentSource, /markAutoReplySent/, 'ggr-mcp must not expose worker-only sent status mutation')
assert.doesNotMatch(agentSource, /markAutoReplyFailed/, 'ggr-mcp must not expose worker-only failure status mutation')
assert.doesNotMatch(agentSource, /markAutoReplyExpired/, 'ggr-mcp must not expose worker-only expiry status mutation')
assert.doesNotMatch(agentSource, /ensureHeadlessPatch/, 'ggr-mcp must not patch source files at runtime')
assert.doesNotMatch(agentSource, /source\.replace\(['"]headless:\s*false/, 'ggr-mcp must not rewrite Puppeteer source')

const serverSource = await read('packages/ggr-mcp/server.mjs')
assert.doesNotMatch(serverSource, /['"]semi_auto['"]|['"]manual['"]/, 'ggr-mcp must not advertise unsupported agent modes')
assert.match(serverSource, /enum:\s*\[['"]auto['"]\]/, 'ggr-mcp must expose the supported automatic mode')
assert.match(serverSource, /boss_read_app_data/, 'ggr-mcp must expose app-data reads to Hermes')
assert.match(serverSource, /boss_update_app_data/, 'ggr-mcp must expose app-data updates to Hermes')
assert.match(serverSource, /boss_list_ai_reply_approvals/, 'ggr-mcp must expose listing AI reply approvals to Hermes')
assert.match(serverSource, /boss_approve_auto_reply/, 'ggr-mcp must expose allowing AI auto replies to Hermes')
assert.match(serverSource, /boss_require_human_intervention/, 'ggr-mcp must expose manual handoff to Hermes')
assert.doesNotMatch(serverSource, /markAutoReplySent|markAutoReplyFailed|markAutoReplyExpired/, 'ggr-mcp server must not expose worker-only status mutations')

console.log('ggr-mcp check passed')
