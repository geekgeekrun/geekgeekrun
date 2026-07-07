import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentService } from '../lib/agent-service.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

const service = createAgentService()
const status = service.getStatus()

assert.equal(status.running, false)
assert.equal(status.pid, null)
assert.equal('ensureHeadlessPatch' in service, false, 'agent service must not mutate source files to enable headless mode')

await assert.rejects(
  service.updateConfig({ fileName: 'secrets.json', patch: {} }),
  /Unsupported config file/
)

const coreSource = await read('packages/geek-auto-start-chat-with-boss/index.mjs')
assert.match(coreSource, /headless:\s*process\.env\.GGR_HEADLESS\s*===\s*['"]true['"]/, 'core must read headless mode from GGR_HEADLESS')
assert.doesNotMatch(coreSource, /headless:\s*false/, 'core must not hard-code visible browser mode')

const agentSource = await read('packages/ggr-mcp/lib/agent-service.mjs')
assert.doesNotMatch(agentSource, /ensureHeadlessPatch/, 'ggr-mcp must not patch source files at runtime')
assert.doesNotMatch(agentSource, /source\.replace\(['"]headless:\s*false/, 'ggr-mcp must not rewrite Puppeteer source')

console.log('ggr-mcp check passed')
