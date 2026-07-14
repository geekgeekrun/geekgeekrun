import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ui = path.join(root, 'packages/ui')
await run('pnpm', ['--filter', 'geekgeekrun-ui', 'build:unpack'], { cwd: root, maxBuffer: 10 * 1024 * 1024 })
const entries = (await run('find', [path.join(ui, 'dist'), '-type', 'f'], { cwd: root, maxBuffer: 10 * 1024 * 1024 })).stdout
assert.match(entries, /ggrd-bootstrap\/runtime\/bin\/node/, 'unpacked UI must contain the pinned supervisor runtime')
const bootstrapRuntimeEntries = entries.split('\n').filter((entry) => entry.endsWith('/ggrd-bootstrap/runtime/bin/node'))
assert.equal(bootstrapRuntimeEntries.length, 1, `unpacked UI must contain exactly one supervisor bootstrap runtime, found: ${bootstrapRuntimeEntries.join(', ')}`)
assert.doesNotMatch(entries, /(?:puppeteer|chrome-linux|chromium|better-sqlite3|sqlite-plugin|ggr-backend|geek-auto-start-chat-with-boss)/i, 'unpacked UI must not contain backend automation, Chromium, or native backend dependencies')
for (const archive of entries.split('\n').filter((entry) => entry.endsWith('.asar'))) {
  const { stdout } = await run('npx', ['asar', 'list', archive], { cwd: root })
  assert.doesNotMatch(stdout, /(?:puppeteer|chromium|better-sqlite3|sqlite-plugin|ggr-backend|geek-auto-start-chat-with-boss)/i, `ASAR must exclude backend implementation: ${archive}`)
}
console.log('UI unpack check passed')
