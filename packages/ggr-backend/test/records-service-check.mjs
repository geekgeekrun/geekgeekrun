import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { initDb } from '@geekgeekrun/sqlite-plugin'
import { AutoStartChatRunRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/AutoStartChatRunRecord.js'
import { createRecordsService } from '../lib/services/records-service.mjs'

const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-records-'))
const databaseFile = path.join(tempHome, 'records.sqlite')
const dataSource = await initDb(databaseFile)

try {
  const repository = dataSource.getRepository(AutoStartChatRunRecord)
  for (const date of ['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z', '2025-01-03T00:00:00.000Z']) {
    await repository.save(Object.assign(new AutoStartChatRunRecord(), { date: new Date(date) }))
  }

  const records = createRecordsService({ dataSource })
  const first = await records.list({ resource: 'autoStartChatRuns', page: 1, pageSize: 2, filters: {} })
  const second = await records.list({ resource: 'autoStartChatRuns', page: 2, pageSize: 2 })
  assert.deepEqual({ total: first.total, page: first.page, pageSize: first.pageSize }, { total: 3, page: 1, pageSize: 2 })
  assert.equal(first.items.length, 2)
  assert.equal(second.total, 3)
  assert.equal(second.items.length, 1)
  assert.equal(typeof first.items[0].date, 'string')
  assert.doesNotThrow(() => JSON.stringify(first))

  for (const request of [
    { resource: 'unknown', page: 1, pageSize: 10 },
    { resource: 'autoStartChatRuns', page: 0, pageSize: 10 },
    { resource: 'autoStartChatRuns', page: 1, pageSize: 101 },
    { resource: 'autoStartChatRuns', page: 1, pageSize: 10, filters: { rawSql: 'DROP TABLE x' } }
  ]) await assert.rejects(records.list(request), { code: 'INVALID_PARAMS' })

  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const serviceFiles = await fs.readdir(path.join(backendRoot, 'lib', 'services'))
  const entityImporters = []
  for (const filename of serviceFiles.filter((name) => name.endsWith('.mjs'))) {
    const source = await fs.readFile(path.join(backendRoot, 'lib', 'services', filename), 'utf8')
    if (source.includes('@geekgeekrun/sqlite-plugin/dist/entity/')) entityImporters.push(filename)
  }
  assert.deepEqual(entityImporters, ['records-service.mjs'])
} finally {
  await dataSource.destroy().catch(() => {})
  await fs.rm(tempHome, { recursive: true, force: true })
}

console.log('ggr backend records service check passed')
