import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = await fs.readFile(path.join(packageRoot, 'index.mjs'), 'utf8')

assert.equal((source.match(/findStartChatButton\(page\)/g) ?? []).length, 2, 'chat eligibility and click must use the shared locator')
assert.doesNotMatch(source, /\.op-btn\.op-btn-chat/, 'chat flow must not retain the brittle button class selector')
assert(source.indexOf('const addFriendResponsePromise = waitAddFriendResponse()') < source.indexOf('await startChatButtonProxy.click()'), 'the add-friend response listener must exist before clicking')

console.log('chat flow wiring check passed')
