import assert from 'node:assert/strict'

import { openBoss } from '../lib/services/browser/open-boss.mjs'
import { openLogin } from '../lib/services/browser/open-login.mjs'

for (const operation of [openBoss, openLogin]) {
  let closes = 0
  const browser = { async close() { closes++ } }
  await assert.rejects(operation({
    runtime: {
      async [operation === openBoss ? 'openBoss' : 'openLogin']({ onBrowserOpened }) {
        onBrowserOpened(browser)
        throw Object.assign(new Error('navigation failed'), { code: 'NAVIGATION_FAILED' })
      }
    },
    taskReporter: { emit() {} },
    taskId: 'task-one'
  }), { code: 'NAVIGATION_FAILED' })
  assert.equal(closes, 1)
}

console.log('ggr backend browser service check passed')
