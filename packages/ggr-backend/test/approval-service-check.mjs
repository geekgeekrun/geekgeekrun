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
    const firstHeartbeat = (await fs.stat(lockPath)).mtimeMs
    await delay(60)
    const refreshedHeartbeat = (await fs.stat(lockPath)).mtimeMs
    assert(refreshedHeartbeat > firstHeartbeat)

    let competitorFinished = false
    const competitor = service.list().then(() => { competitorFinished = true })
    await delay(30)
    assert.equal(competitorFinished, false)
    await longUpdate
    await competitor
  }

  for (const malformed of ['', '{"token":"partial"']) {
    await fs.writeFile(lockPath, malformed)
    const old = new Date(Date.now() - 1000)
    await fs.utimes(lockPath, old, old)
    const recovered = await createApprovalService({
      queueFilePath,
      lockStaleMs: 20,
      lockRetryMs: 2,
      lockTimeoutMs: 500
    }).list()
    assert.equal(recovered.length, 1)
    await assert.rejects(fs.lstat(lockPath), { code: 'ENOENT' })
  }

  {
    const stale = { token: 'stale-primary', pid: absentPid, leaseAt: 0 }
    const orphanedCleaner = { token: 'orphaned-cleaner', pid: absentPid, leaseAt: 0 }
    const legacyRecovery = `${lockPath}.clean.recover`
    await fs.writeFile(lockPath, JSON.stringify(stale))
    await fs.writeFile(`${lockPath}.clean`, JSON.stringify(orphanedCleaner))
    await fs.writeFile(legacyRecovery, '')
    const old = new Date(Date.now() - 1000)
    await fs.utimes(lockPath, old, old)
    await fs.utimes(`${lockPath}.clean`, old, old)
    await fs.utimes(legacyRecovery, old, old)
    const options = { queueFilePath, lockStaleMs: 20, lockRetryMs: 2, lockTimeoutMs: 1000 }
    const recovered = await Promise.all([
      createApprovalService(options).list(),
      createApprovalService(options).list(),
      createApprovalService(options).list()
    ])
    assert(recovered.every((items) => items.length === 1))
    await assert.rejects(fs.lstat(`${lockPath}.clean`), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(legacyRecovery), { code: 'ENOENT' })
    assert.equal((await fs.readdir(tempDir)).some((entry) => entry.includes('.clean.recover.')), false)
  }

  {
    const stale = { token: 'stale-with-intent', pid: absentPid, leaseAt: 0 }
    const orphanedCleaner = { token: 'cleaner-with-intent', pid: absentPid, leaseAt: 0 }
    const orphanedIntentPath = `${lockPath}.clean.recover.00000000-0000-4000-8000-000000000000`
    const orphanedIntent = { token: '00000000-0000-4000-8000-000000000000', pid: absentPid, leaseAt: 0 }
    await fs.writeFile(lockPath, JSON.stringify(stale))
    await fs.writeFile(`${lockPath}.clean`, JSON.stringify(orphanedCleaner))
    await fs.writeFile(orphanedIntentPath, JSON.stringify(orphanedIntent))
    const old = new Date(Date.now() - 1000)
    await Promise.all([
      fs.utimes(lockPath, old, old),
      fs.utimes(`${lockPath}.clean`, old, old),
      fs.utimes(orphanedIntentPath, old, old)
    ])
    const recovered = await createApprovalService({
      queueFilePath,
      lockStaleMs: 20,
      lockRetryMs: 2,
      lockTimeoutMs: 1000
    }).list()
    assert.equal(recovered.length, 1)
    await assert.rejects(fs.lstat(orphanedIntentPath), { code: 'ENOENT' })
  }

  {
    const stalePrimary = { token: 'primary-behind-cleaner', pid: absentPid, leaseAt: 0 }
    const staleCleaner = { token: 'replace-cleaner', pid: absentPid, leaseAt: 0 }
    const successor = { token: 'live-cleaner-successor', pid: process.pid, leaseAt: Date.now() }
    await fs.writeFile(lockPath, JSON.stringify(stalePrimary))
    await fs.writeFile(`${lockPath}.clean`, JSON.stringify(staleCleaner))
    const old = new Date(Date.now() - 1000)
    await fs.utimes(lockPath, old, old)
    await fs.utimes(`${lockPath}.clean`, old, old)
    let replacedCleaner = false
    const options = {
      queueFilePath,
      lockStaleMs: 20,
      lockRetryMs: 2,
      lockTimeoutMs: 60,
      isProcessAlive(pid) {
        if (pid === absentPid && !replacedCleaner) {
          replacedCleaner = true
          fsSync.unlinkSync(`${lockPath}.clean`)
          fsSync.writeFileSync(`${lockPath}.clean`, JSON.stringify(successor), { mode: 0o600 })
        }
        return pid === process.pid
      }
    }
    await assert.rejects(createApprovalService(options).list(), /Timed out waiting/)
    assert.deepEqual(JSON.parse(await fs.readFile(`${lockPath}.clean`, 'utf8')), successor)
    await fs.unlink(`${lockPath}.clean`)
    await fs.unlink(lockPath)
  }

  {
    const service = createApprovalService({ queueFilePath, lockRetryMs: 1, lockTimeoutMs: 500 })
    const parseFailures = []
    for (let index = 0; index < 100; index++) {
      const operation = service.update(async () => { await delay(1) })
      while (true) {
        try {
          JSON.parse(await fs.readFile(lockPath, 'utf8'))
        } catch (error) {
          if (error?.code !== 'ENOENT') parseFailures.push(error)
        }
        if (await Promise.race([operation.then(() => true), delay(0).then(() => false)])) break
      }
      await operation
    }
    assert.deepEqual(parseFailures, [])
  }

  {
    await fs.writeFile(lockPath, JSON.stringify({ token: 'stale-owner', pid: absentPid, leaseAt: 0 }))
    const old = new Date(Date.now() - 1000)
    await fs.utimes(lockPath, old, old)
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
    const old = new Date(Date.now() - 1000)
    await fs.utimes(lockPath, old, old)
    let replaced = false
    const replacement = { token: 'replacement-owner', pid: process.pid, leaseAt: Date.now() }
    const options = {
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
    }
    const settled = await Promise.allSettled([
      createApprovalService(options).list(),
      createApprovalService(options).list()
    ])
    assert(settled.every(({ status, reason }) => status === 'rejected' && /Timed out waiting/.test(reason.message)))
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
