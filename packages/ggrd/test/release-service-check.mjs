import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createVersionStore } from '../lib/version-store.mjs'
import { createSupervisorServer } from '../server.mjs'

let createReleaseService
try {
  ({ createReleaseService } = await import('../lib/release-service.mjs'))
} catch (error) {
  assert.fail(`release service must exist: ${error.message}`)
}

const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-first-install-'))
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const archive = Buffer.from('first backend artifact')
const unsignedManifest = {
  version: '1.0.0',
  artifacts: [{ platform: process.platform, arch: process.arch, url: 'https://updates.example.test/backend.tar.gz', size: archive.length, sha256: createHash('sha256').update(archive).digest('hex'), extractionSize: 64 }],
  protocolMin: 1, protocolMax: 1, minClientVersion: '1.0.0', database: { schemaVersion: 0, rollbackCompatible: true }
}
const rawManifest = Buffer.from(JSON.stringify(unsignedManifest))
const signature = sign(null, rawManifest, privateKey).toString('base64')
const store = createVersionStore(runtime)
const service = createReleaseService({
  versionStore: store,
  trustRoot: { publicKey, manifestEndpoints: { stable: 'https://updates.example.test/manifest.json' } },
  fetchImpl: async (url) => ({ ok: true, arrayBuffer: async () => url.endsWith('.sig') ? Buffer.from(signature) : url.endsWith('.tar.gz') ? archive : rawManifest }),
  extract: async () => [
    { path: 'bin/node', type: 'file', data: Readable.from(['node']) },
    { path: 'app/server.mjs', type: 'file', data: Readable.from(['export {}']) }
  ],
  freeSpace: async () => Number.MAX_SAFE_INTEGER,
  platform: process.platform,
  arch: process.arch,
  clientVersion: '1.0.0'
})
try {
  const manifest = await service.checkForUpdates()
  assert.equal(manifest.version, '1.0.0', 'signed channel manifest is selected for first install')
  const supervisor = await createSupervisorServer({ runtimeDir: runtime, versionStore: store, releaseService: service })
  assert.equal((await supervisor.api.dispatch({ id: 'check', method: 'update.check', params: {} })).version, '1.0.0', 'the production supervisor exposes its release service')
  await supervisor.stop()
  await service.install({ manifest })
  assert.equal((await fs.stat(path.join(runtime, 'versions', '1.0.0', 'app', 'server.mjs'))).isFile(), true)
  assert.equal(await store.current(), null, 'release installation stages before supervisor activation')

  const timedRuntime = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-deadline-'))
  const timedStore = createVersionStore(timedRuntime)
  const timedService = createReleaseService({
    versionStore: timedStore,
    trustRoot: { publicKey, manifestEndpoints: { stable: 'https://updates.example.test/manifest.json' } },
    fetchImpl: async (url, { signal } = {}) => {
      if (!url.endsWith('.tar.gz')) return { ok: true, arrayBuffer: async () => url.endsWith('.sig') ? Buffer.from(signature) : rawManifest }
      return await new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }))
    },
    extract: service.extract,
    freeSpace: async () => Number.MAX_SAFE_INTEGER,
    platform: process.platform, arch: process.arch, clientVersion: '1.0.0'
  })
  await assert.rejects(timedService.install({ manifest, deadlineMs: 10 }), { code: 'INSTALL_DEADLINE_EXCEEDED' }, 'download, verification, extraction, staging, and activation share a bounded install deadline')
  await fs.rm(timedRuntime, { recursive: true, force: true })
} finally {
  await fs.rm(runtime, { recursive: true, force: true })
}
console.log('ggrd release service check passed')
