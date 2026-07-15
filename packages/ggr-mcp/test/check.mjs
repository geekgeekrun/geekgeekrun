import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { createAgentService } from '../lib/agent-service.mjs'
import { createMcpServer } from '../lib/mcp-stdio.mjs'

async function readJsonLine(stream, timeoutMs = 250) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for newline-delimited MCP response')), timeoutMs)
    stream.once('data', (chunk) => {
      clearTimeout(timeout)
      resolve(JSON.parse(chunk.toString().trim()))
    })
  })
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

let connectCount = 0
let requestCount = 0
const client = {
  connected: false,
  async connect() {
    connectCount++
    this.connected = true
  },
  async request(method, params) {
    requestCount++
    if (requestCount === 1) {
      this.connected = false
      const error = new Error('backend connection closed')
      error.code = 'CONNECTION_CLOSED'
      throw error
    }
    return { method, params }
  }
}
const service = createAgentService({ client })
await service.connect()
assert.equal(connectCount, 1)
assert.deepEqual(await service.getStatus(), { method: 'system.health', params: {} })
assert.equal(connectCount, 2)
assert.equal(requestCount, 2)

const errorInput = new PassThrough()
const errorOutput = new PassThrough()
createMcpServer({
  name: 'ggr-mcp-error-test',
  version: '0.1.0',
  tools: [{
    name: 'backend_error',
    description: 'test protocol error mapping',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const error = new Error('backend unavailable')
      error.code = 'CONNECTION_CLOSED'
      throw error
    }
  }]
}).start({ input: errorInput, output: errorOutput })
const errorResponsePromise = readJsonLine(errorOutput)
errorInput.write(`${JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: 'backend_error', arguments: {} }
})}\n`)
const errorResponse = await errorResponsePromise
assert.equal(errorResponse.result.isError, true)
assert.match(errorResponse.result.content[0].text, /backend unavailable/)

const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8')
for (const toolName of [
  'boss_get_status',
  'boss_start_agent',
  'boss_stop_agent',
  'boss_update_config',
  'boss_read_app_data',
  'boss_update_app_data',
  'boss_list_ai_reply_approvals',
  'boss_approve_auto_reply',
  'boss_require_human_intervention'
]) {
  assert.match(serverSource, new RegExp(toolName))
}
assert.match(serverSource, /agentService\.connect\(\)\.catch/)
assert.doesNotMatch(serverSource, /child process/)
for (const forbidden of [
  ['repo', 'Root'].join(''),
  ['daemon', '-main.mjs'].join(''),
  ['config', 'Dir'].join(''),
  ['approval', 'QueueFilePath'].join('')
]) {
  assert.doesNotMatch(serverSource, new RegExp(forbidden))
}

console.log('ggr-mcp check passed')
