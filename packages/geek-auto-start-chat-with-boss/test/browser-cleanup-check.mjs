import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import { closeBrowserWindow } from '../index.mjs'

{
  const closeError = new Error('browser transport already closed')
  let closeCalls = 0
  const result = await closeBrowserWindow({
    async close () {
      closeCalls++
      throw closeError
    }
  })

  assert.equal(closeCalls, 1, 'browser cleanup must have exactly one owner')
  assert.equal(result, closeError, 'cleanup must return a close failure for the caller to report')
}

const source = await fs.readFile(new URL('../index.mjs', import.meta.url), 'utf8')
assert.match(source, /const closeError = await closeBrowserWindow\(\)/)
assert(!source.includes('process.kill(browserProcess.pid)'), 'Puppeteer owns browser shutdown')

console.log('ggr browser cleanup check passed')
