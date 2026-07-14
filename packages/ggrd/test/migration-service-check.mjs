import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createMigrationService } from '../lib/migration-service.mjs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const betterSqlite3 = require.resolve('better-sqlite3')
const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-migration-rehearsal-'))

async function candidate(version, { failRehearsal = false } = {}) {
  const root = path.join(runtimeDir, 'versions', version)
  await fs.mkdir(path.join(root, 'bin'), { recursive: true })
  await fs.mkdir(path.join(root, 'app'), { recursive: true })
  const node = path.join(root, 'bin', 'node')
  // A regular launcher keeps this fixture independent of the host Node
  // installation's adjacent shared-library layout.
  await fs.writeFile(node, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`)
  await fs.chmod(node, 0o755)
  const entry = `
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const Database = createRequire(import.meta.url)(${JSON.stringify(betterSqlite3)})
const arg = (name, offset = 1) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + offset] ?? null }
const source = arg('--backup')
if (source) {
  const destination = arg('--backup', 2)
  const database = new Database(source, { readonly: true, fileMustExist: true })
  try { await database.backup(destination) } finally { database.close() }
} else {
  const copy = arg('--rehearse')
  const schemaVersion = arg('--rehearse', 2)
  if (!copy || !/^\\d+$/.test(schemaVersion ?? '')) throw new Error('expected --rehearse <database> <schemaVersion>')
  ${failRehearsal ? "throw new Error('fixture migration failure')" : `const database = new Database(copy, { fileMustExist: true })\n  try { database.exec('ALTER TABLE records ADD COLUMN rehearsed INTEGER NOT NULL DEFAULT 1'); database.pragma(\`user_version = \${Number(schemaVersion)}\`) } finally { database.close() }\n  await fs.writeFile(${JSON.stringify(path.join(root, 'migration-evidence.json'))}, JSON.stringify({ copy, schemaVersion }))`}
}
`
  await fs.writeFile(path.join(root, 'app', 'migration.mjs'), entry)
  return root
}

try {
  const live = path.join(runtimeDir, 'data', 'database.sqlite')
  await fs.mkdir(path.dirname(live), { recursive: true })
  const source = new Database(live)
  source.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records (value) VALUES (\'live\');')
  source.pragma('user_version = 3')
  source.close()

  await candidate('1.0.0')
  const migration = createMigrationService({ runtimeDir })
  const result = await migration.rehearse({
    version: '1.0.0',
    versionsDir: path.join(runtimeDir, 'versions'),
    database: { schemaVersion: 7, rollbackCompatible: true, rehearsalEntrypoint: 'app/migration.mjs' }
  })
  assert.equal(result.state, 'validated')
  const liveAfter = new Database(live, { readonly: true })
  assert.equal(liveAfter.pragma('user_version', { simple: true }), 3, 'candidate migration must not alter the live database')
  assert.deepEqual(liveAfter.prepare('PRAGMA table_info(records)').all().map(({ name }) => name), ['id', 'value'])
  liveAfter.close()
  const durableBackup = new Database(result.backup, { readonly: true })
  assert.equal(durableBackup.pragma('user_version', { simple: true }), 3, 'durable rollback backup remains pre-migration')
  assert.deepEqual(durableBackup.prepare('PRAGMA table_info(records)').all().map(({ name }) => name), ['id', 'value'])
  durableBackup.close()
  const evidence = JSON.parse(await fs.readFile(path.join(runtimeDir, 'versions', '1.0.0', 'migration-evidence.json'), 'utf8'))
  assert.notEqual(evidence.copy, live, 'the candidate receives only the backup copy in --rehearse mode')
  assert.equal(evidence.schemaVersion, '7', 'the signed schema metadata is passed to the candidate migration')
  assert.equal((await fs.readdir(path.join(runtimeDir, '.migration-rehearsals'))).length, 0, 'temporary rehearsal copies are removed')

  await candidate('1.0.1', { failRehearsal: true })
  await assert.rejects(
    migration.rehearse({
      version: '1.0.1',
      versionsDir: path.join(runtimeDir, 'versions'),
      database: { schemaVersion: 7, rollbackCompatible: true, rehearsalEntrypoint: 'app/migration.mjs' }
    }),
    { code: 'MIGRATION_REHEARSAL_FAILED' }
  )
} finally {
  await fs.rm(runtimeDir, { recursive: true, force: true })
}

console.log('ggrd migration rehearsal check passed')
