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

  await store.stage('3.1.0', executableTree)
  const unjournaledCurrentNext = path.join(runtimeDir, 'current.next')
  await fs.symlink(path.join('versions', '3.1.0'), unjournaledCurrentNext)
  await assert.rejects(store.activate('3.1.0'), /Unjournaled version pointer transaction collision/)
  assert.equal(await fs.readlink(path.join(runtimeDir, 'current')), path.join('versions', '1.0.0'))
  assert.equal(await fs.readlink(path.join(runtimeDir, 'previous')), path.join('versions', '2.0.0'))
  await fs.unlink(unjournaledCurrentNext)

  const failingOps = Object.create(fs)
  failingOps.rename = async (source, destination) => {
    if (source.endsWith(`${path.sep}current.next`) && destination.endsWith(`${path.sep}current`)) throw new Error('simulated current swap failure')
    return fs.rename(source, destination)
  }
  const failureStore = createVersionStore(runtimeDir, { fsOps: failingOps })
  await assert.rejects(failureStore.activate('3.1.0'), /simulated current swap failure/)
  assert.equal(await store.current(), '1.0.0')
  assert.equal(await store.previous(), '2.0.0', 'failed activation must preserve the prior rollback pointer')

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
    extract: async () => [
      { path: 'bin/node', type: 'file', data: Buffer.from('#!/bin/sh\n') },
      { path: 'app/server.mjs', type: 'file', data: Buffer.from('export {}\n') }
    ]
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

  const traversalArchive = Buffer.from('traversal artifact')
  const traversalArtifact = {
    url: 'https://updates.example.test/ggrd-5.0.0.tar.gz',
    sha256: createHash('sha256').update(traversalArchive).digest('hex'),
    size: traversalArchive.length,
    extractionSize: 1024
  }
  const escaped = path.join(runtimeDir, 'escaped-by-archive')
  await assert.rejects(installArtifact({
    manifest: { version: '5.0.0', artifact: traversalArtifact, database: { schemaVersion: 2, rollbackCompatible: true } },
    versionStore: store,
    download: async () => Readable.from([traversalArchive]),
    extract: async () => [
      { path: '../escaped-by-archive', type: 'file', data: Buffer.from('malicious') },
      { path: 'bin/node', type: 'file', data: Buffer.from('#!/bin/sh\n') },
      { path: 'app/server.mjs', type: 'file', data: Buffer.from('export {}\n') }
    ]
  }), { code: 'EXTRACTION_PATH_INVALID' })
  await assert.rejects(fs.lstat(escaped), { code: 'ENOENT' })

  const safetyArchive = Buffer.from('safety artifact')
  const safetyArtifact = {
    url: 'https://updates.example.test/ggrd-6.0.0.tar.gz',
    sha256: createHash('sha256').update(safetyArchive).digest('hex'),
    size: safetyArchive.length,
    extractionSize: 1024
  }
  await assert.rejects(installArtifact({
    manifest: { version: '6.0.0', artifact: safetyArtifact, database: { schemaVersion: 2, rollbackCompatible: true } },
    versionStore: store,
    download: async () => Readable.from([safetyArchive]),
    extract: async () => [{ path: 'bin/node', type: 'symlink', data: Buffer.from('ignored') }]
  }), { code: 'EXTRACTION_UNSAFE' })

  await assert.rejects(installArtifact({
    manifest: { version: '6.1.0', artifact: { ...safetyArtifact, sha256: 'b'.repeat(64) }, database: { schemaVersion: 2, rollbackCompatible: true } },
    versionStore: store,
    download: async () => Readable.from([safetyArchive]),
    extract: async () => []
  }), { code: 'DIGEST_MISMATCH' })

  await assert.rejects(installArtifact({
    manifest: { version: '6.2.0', artifact: safetyArtifact, database: { schemaVersion: 2, rollbackCompatible: true } },
    versionStore: store,
    freeSpace: async () => 0,
    download: async () => { throw new Error('download must not start without disk space') },
    extract: async () => []
  }), { code: 'DISK_SPACE_INSUFFICIENT' })

  const savedFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://redirect.example.test/artifact' } })
  try {
    await assert.rejects(installArtifact({
      manifest: { version: '6.3.0', artifact: safetyArtifact, database: { schemaVersion: 2, rollbackCompatible: true } },
      versionStore: store,
      freeSpace: async () => Number.MAX_SAFE_INTEGER,
      extract: async () => []
    }), { code: 'URL_INSECURE' })
  } finally {
    globalThis.fetch = savedFetch
  }

  await store.stage('7.0.0', executableTree)
  const postCommitFailureOps = Object.create(fs)
  postCommitFailureOps.rename = async (source, destination) => {
    if (source.endsWith(`${path.sep}previous.next`) && destination.endsWith(`${path.sep}previous`)) throw new Error('simulated previous pointer failure')
    return fs.rename(source, destination)
  }
  const postCommitFailureStore = createVersionStore(runtimeDir, { fsOps: postCommitFailureOps })
  await assert.rejects(postCommitFailureStore.activate('7.0.0'), /simulated previous pointer failure/)
  assert.equal(await store.current(), '7.0.0', 'recovery must retain the committed current target')
  assert.equal(await store.previous(), '1.0.0', 'recovery must restore the immediately prior current target')
} finally {
  await fs.rm(runtimeDir, { recursive: true, force: true })
}

console.log('ggrd installer check passed')
