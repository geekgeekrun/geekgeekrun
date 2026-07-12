import assert from 'node:assert/strict'
import {
  EVENTS,
  METHODS,
  PROTOCOL_VERSION,
  assertHandshake,
  createError,
  createRequest
} from '../index.mjs'

assert.equal(PROTOCOL_VERSION, 1)
assert.equal(METHODS.SYSTEM_HANDSHAKE, 'system.handshake')
assert.equal(METHODS.TASK_START, 'task.start')
assert.equal(EVENTS.TASK_PROGRESS, 'task.progress')
assert.deepEqual(createRequest('r1', METHODS.TASK_START, { workerId: 'geekAutoStartWithBossMain' }), {
  id: 'r1', method: 'task.start', params: { workerId: 'geekAutoStartWithBossMain' }
})
assert.equal(assertHandshake({ client: 'electron', clientVersion: '0.17.4', protocolVersion: 1 }).client, 'electron')
assert.throws(() => assertHandshake({ client: '', protocolVersion: 1 }), /clientVersion/)
assert.deepEqual(createError('r2', 'METHOD_NOT_FOUND', 'missing'), {
  id: 'r2', error: { code: 'METHOD_NOT_FOUND', message: 'missing' }
})
console.log('ggr-protocol check passed')
