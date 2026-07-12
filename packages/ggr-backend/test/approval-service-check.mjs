import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createApprovalService } from '../lib/services/approval-service.mjs'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const absentPid = 2_147_483_647
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-approval-lock-'))
const queueFilePath = path.join(tempDir, 'queue.json')
const lockPath = `${queueFilePath}.lock`

try {
  await fs.writeFile(queueFilePath, JSON.stringify([{ id: 'one', status: 'pending' }]))

  {
    const service = createApprovalService({
      queueFilePath,
      lockStaleMs: 40,
      lockHeartbeatMs: 10,
      lockRetryMs: 5,
      lockTimeoutMs: 500
    })
    let entered
    const inside = new Promise((resolve) => { entered = resolve })
    const longUpdate = service.update(async (queue) => {
      entered()
      await delay(140)
      queue[0].longUpdateFinished = true
    })
    await inside
    const firstLease = JSON.parse(await fs.readFile(lockPath, 'utf8'))
    assert.match(firstLease.token, /^[0-9a-f-]{36}$/)
    assert.equal(firstLease.pid, process.pid)
    await delay(60)
    const refreshedLease = JSON.parse(await fs.readFile(lockPath, 'utf8'))
    assert(refreshedLease.leaseAt > firstLease.leaseAt)

    let competitorFinished = false
    const competitor = service.list().then(() => { competitorFinished = true })
    await delay(30)
    assert.equal(competitorFinished, false)
    await longUpdate
    await competitor
  }

  {
    await fs.writeFile(lockPath, JSON.stringify({ token: 'stale-owner', pid: absentPid, leaseAt: 0 }))
    const options = { queueFilePath, lockStaleMs: 20, lockRetryMs: 2, lockTimeoutMs: 500 }
    const [first, second] = await Promise.all([
      createApprovalService(options).list(),
      createApprovalService(options).list()
    ])
    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    await assert.rejects(fs.lstat(lockPath), { code: 'ENOENT' })
  }

  {
    await fs.writeFile(lockPath, JSON.stringify({ token: 'replace-me', pid: absentPid, leaseAt: 0 }))
    let replaced = false
    const replacement = { token: 'replacement-owner', pid: process.pid, leaseAt: Date.now() }
    const service = createApprovalService({
      queueFilePath,
      lockStaleMs: 10,
      lockRetryMs: 2,
      lockTimeoutMs: 40,
      isProcessAlive(pid) {
        if (pid === absentPid && !replaced) {
          replaced = true
          fsSync.unlinkSync(lockPath)
          fsSync.writeFileSync(lockPath, JSON.stringify(replacement), { mode: 0o600 })
        }
        return pid === process.pid
      }
    })
    await assert.rejects(service.list(), /Timed out waiting for approval queue lock/)
    assert.deepEqual(JSON.parse(await fs.readFile(lockPath, 'utf8')), replacement)
    await fs.unlink(lockPath)
  }

  {
    const replacement = { token: 'release-replacement', pid: process.pid, leaseAt: Date.now() }
    const service = createApprovalService({ queueFilePath, lockRetryMs: 2, lockTimeoutMs: 100 })
    await service.update(async () => {
      const holder = JSON.parse(await fs.readFile(lockPath, 'utf8'))
      assert.equal(holder.pid, process.pid)
      await fs.unlink(lockPath)
      await fs.writeFile(lockPath, JSON.stringify(replacement), { mode: 0o600 })
    })
    assert.deepEqual(JSON.parse(await fs.readFile(lockPath, 'utf8')), replacement)
    await fs.unlink(lockPath)
  }
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('ggr backend approval service check passed')
