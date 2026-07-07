import assert from 'node:assert/strict'
import { createAgentService } from '../lib/agent-service.mjs'

const service = createAgentService()
const status = service.getStatus()

assert.equal(status.running, false)
assert.equal(status.pid, null)

await assert.rejects(
  service.updateConfig({ fileName: 'secrets.json', patch: {} }),
  /Unsupported config file/
)

console.log('ggr-mcp check passed')
