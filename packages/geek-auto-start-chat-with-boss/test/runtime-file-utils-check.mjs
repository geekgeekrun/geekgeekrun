import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const oldHome = process.env.HOME
const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-runtime-'))
process.env.HOME = tempHome

try {
  const runtime = await import(`../runtime-file-utils.mjs?check=${Date.now()}`)
  const configPath = path.join(tempHome, '.geekgeekrun/config/boss.json')

  await runtime.writeConfigFile('boss.json', { ok: true })
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600)

  await fs.writeFile(configPath, '{bad json', { mode: 0o600 })
  runtime.readConfigFile('boss.json')

  const files = await fs.readdir(path.dirname(configPath))
  assert.ok(files.some(fileName => fileName.startsWith('boss.json.corrupt-') && fileName.endsWith('.bak')))
  const recoveredConfig = await fs.readFile(configPath, 'utf8')
  assert.doesNotThrow(() => JSON.parse(recoveredConfig))
} finally {
  process.env.HOME = oldHome
  await fs.rm(tempHome, { recursive: true, force: true })
}

console.log('runtime-file-utils check passed')
