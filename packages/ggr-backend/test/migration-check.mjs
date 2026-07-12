import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { initDb } from '@geekgeekrun/sqlite-plugin'
import { AutoStartChatRunRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/AutoStartChatRunRecord.js'

import { createMigrationService } from '../lib/services/migration-service.mjs'

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-migration-'))
const sourceDb = path.join(tempHome, 'live.sqlite')
const stagingRoot = path.join(tempHome, 'staging')
const backupRoot = path.join(tempHome, 'backups')
const database = await initDb(sourceDb)
await database.getRepository(AutoStartChatRunRecord).save(Object.assign(new AutoStartChatRunRecord(), { date: new Date('2025-01-01T00:00:00.000Z') }))
await database.destroy()
const digest = async () => createHash('sha256').update(await fs.readFile(sourceDb)).digest('hex')
const before = await digest()
const migration = createMigrationService({ stagingRoot, backupRoot })

try {
  await assert.rejects(migration.rehearseMigrations({
    sourceDb,
    candidateVersion: '2.0.0',
    compatibility: { destructive: true, previousVersionReadable: true },
    async runMigrations({ databaseFile }) {
      await fs.writeFile(databaseFile, 'failed candidate mutated only its private copy')
      throw Object.assign(new Error('candidate failed'), { code: 'CANDIDATE_FAILED' })
    }
  }), { code: 'CANDIDATE_FAILED' })
  assert.equal(await digest(), before)
  assert.deepEqual(await fs.readdir(stagingRoot), [])

  await assert.rejects(migration.rehearseMigrations({
    sourceDb,
    candidateVersion: '2.0.0',
    compatibility: { destructive: true, previousVersionReadable: false },
    async runMigrations() {}
  }), { code: 'MIGRATION_INCOMPATIBLE' })

  const backup = await migration.backupLiveDatabase({ sourceDb })
  assert.equal((await fs.stat(backup)).mode & 0o777, 0o600)
  const restored = await initDb(backup)
  assert.equal(await restored.getRepository(AutoStartChatRunRecord).count(), 1)
  await restored.destroy()
} finally {
  await fs.rm(tempHome, { recursive: true, force: true })
}

console.log('ggr backend migration service check passed')
