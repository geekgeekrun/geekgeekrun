import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBackendController, TASKS } from '../index.mjs'

assert.equal(TASKS.AUTO_CHAT.workerId, 'geekAutoStartWithBossMain')
assert.equal(TASKS.READ_NO_REPLY.workerId, 'readNoReplyAutoReminderMain')

const calls = []
const controller = createBackendController({
  client: {
    request: async (method, params) => {
      calls.push([method, params])
      return { method, params }
    }
  }
})

await controller.start({ headless: true })
assert.deepEqual(calls[0], ['task.start', {
  workerId: 'geekAutoStartWithBossMain', options: { headless: true }
}])

await controller.getStatus()
assert.deepEqual(calls[1], ['system.health', {}])

await controller.stop()
assert.deepEqual(calls[2], ['task.stop', { workerId: 'geekAutoStartWithBossMain' }])

await controller.updateConfig({ fileName: 'boss.json', patch: { openingMessage: 'hello' } })
assert.deepEqual(calls[3], ['config.write', { resource: 'opening_message', patch: { openingMessage: 'hello' } }])

await controller.readAppData({ resource: 'llm_config' })
assert.deepEqual(calls[4], ['config.read', { resource: 'llm_config' }])

await controller.updateAppData({ resource: 'llm_config', patch: [] })
assert.deepEqual(calls[5], ['config.write', { resource: 'llm_config', patch: [] }])

await controller.listAiReplyApprovals({ includeAll: true })
assert.deepEqual(calls[6], ['approval.list', { includeAll: true }])

await controller.approveAutoReply({ id: 'approval-1' })
assert.deepEqual(calls[7], ['approval.approve', { id: 'approval-1' }])

await controller.requireHumanIntervention({ id: 'approval-1', reason: 'needs review' })
assert.deepEqual(calls[8], ['approval.requireHuman', { id: 'approval-1', reason: 'needs review' }])

await assert.rejects(
  () => controller.start({ mode: 'manual' }),
  /Unsupported agent mode/
)
await assert.rejects(
  () => controller.updateConfig({ fileName: 'unsupported.json', patch: {} }),
  /Unsupported config file/
)

const controllerSource = await readFile(new URL('../index.mjs', import.meta.url), 'utf8')
const mcpSource = await readFile(new URL('../../ggr-mcp/lib/agent-service.mjs', import.meta.url), 'utf8')
for (const forbidden of [
  ['child', 'process'].join('_'),
  ['repo', 'Root'].join(''),
  ['daemon', '-main.mjs'].join(''),
  ['config', 'Dir'].join(''),
  ['approval', 'QueueFilePath'].join('')
]) {
  assert.doesNotMatch(controllerSource, new RegExp(forbidden))
  assert.doesNotMatch(mcpSource, new RegExp(forbidden))
}

console.log('ggr-controller check passed')
