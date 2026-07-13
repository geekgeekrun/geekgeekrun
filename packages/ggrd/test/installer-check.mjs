import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createVersionStore } from '../lib/version-store.mjs'
import { installArtifact } from '../lib/installer.mjs'

const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-installer-'))
const store = createVersionStore(runtimeDir)

async function executableTree(directory) {
  await fs.mkdir(path.join(directory, 'bin'), { recursive: true })
  await fs.mkdir(path.join(directory, 'app'), { recursive: true })
  await fs.writeFile(path.join(directory, 'bin', 'node'), '#!/bin/sh\n')
  await fs.writeFile(path.join(directory, 'app', 'server.mjs'), 'export {}\n')
}

try {
  await store.stage('1.0.0', executableTree)
  assert.equal(await store.current(), null)
  await store.activate('1.0.0')
  assert.equal(await store.current(), '1.0.0')
  assert.equal(await store.previous(), null)

  await store.stage('2.0.0', executableTree)
  assert.equal(await store.current(), '1.0.0', 'staging must never switch current')
  await store.activate('2.0.0')
  assert.equal(await store.current(), '2.0.0')
  assert.equal(await store.previous(), '1.0.0')
  await store.rollback()
  assert.equal(await store.current(), '1.0.0')
  assert.equal(await store.previous(), '2.0.0')

  await store.stage('0.9.0', executableTree)
  await store.prune()
  assert.deepEqual((await fs.readdir(path.join(runtimeDir, 'versions'))).sort(), ['1.0.0', '2.0.0'])

  const archive = Buffer.from('signed artifact payload')
  const artifact = {
    url: 'https://updates.example.test/ggrd-3.0.0.tar.gz',
    sha256: createHash('sha256').update(archive).digest('hex'),
    size: archive.length,
    extractionSize: 1024
  }
  const manifest = { version: '3.0.0', artifact, database: { schemaVersion: 2, rollbackCompatible: true } }

  await assert.rejects(
    installArtifact({
      manifest,
      versionStore: store,
      download: async () => ({
        stream: Readable.from((async function * () { yield archive.subarray(0, 4); throw new Error('connection lost') })()),
        etag: 'artifact-etag'
      }),
      extract: async () => { throw new Error('extract must not run for a partial download') }
    }),
    /connection lost/
  )
  assert.equal((await fs.readdir(path.join(runtimeDir, 'versions'))).includes('3.0.0'), false)

  let resumedFrom
  const installed = await installArtifact({
    manifest,
    versionStore: store,
    download: async ({ resume }) => {
      resumedFrom = resume
      return { stream: Readable.from([archive.subarray(resume?.bytes ?? 0)]), resumeValidated: true, etag: 'artifact-etag' }
    },
    extract: async ({ destination, resolvePath }) => {
      await executableTree(resolvePath(destination, ''))
    }
  })
  assert.equal(installed.version, '3.0.0')
  assert.deepEqual(resumedFrom, { bytes: 4, validator: 'artifact-etag' })
  assert.equal(await store.current(), '1.0.0', 'installation must stage before explicit activation')
  assert.equal((await fs.readdir(path.join(runtimeDir, 'versions'))).includes('3.0.0'), true)

  const hostileArchive = Buffer.from('another artifact')
  const hostileArtifact = {
    url: 'https://updates.example.test/ggrd-4.0.0.tar.gz',
    sha256: createHash('sha256').update(hostileArchive).digest('hex'),
    size: hostileArchive.length,
    extractionSize: 1024
  }
  const outside = path.join(runtimeDir, 'must-not-be-modified')
  const partial = path.join(runtimeDir, '.staging', `4.0.0-${hostileArtifact.sha256}.part`)
  await fs.writeFile(outside, 'outside')
  await fs.symlink(outside, partial)
  await fs.writeFile(partial.replace(/\.part$/, '.json'), JSON.stringify({
    url: hostileArtifact.url, bytes: 7, etag: 'hostile-etag'
  }))
  await assert.rejects(installArtifact({
    manifest: { version: '4.0.0', artifact: hostileArtifact, database: { schemaVersion: 2, rollbackCompatible: true } },
    versionStore: store,
    download: async () => { throw new Error('must not open a symbolic-link partial') },
    extract: async () => { throw new Error('must not extract a symbolic-link partial') }
  }), { code: 'PARTIAL_UNSAFE' })
  assert.equal(await fs.readFile(outside, 'utf8'), 'outside')
} finally {
  await fs.rm(runtimeDir, { recursive: true, force: true })
}

console.log('ggrd installer check passed')
