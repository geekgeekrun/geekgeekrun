import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-artifact-'))
const outputDirectory = path.join(temporaryRoot, 'dist')
const repeatOutputDirectory = path.join(temporaryRoot, 'dist-repeat')
const extractedDirectory = path.join(temporaryRoot, 'extracted')
const homeDirectory = path.join(temporaryRoot, 'home')
const mockedNode = path.join(temporaryRoot, 'node-20.16.0-test')
const version = '0.1.0-dev'

function run(command, args, options = {}) {
  return execFileAsync(command, args, { cwd: repoRoot, ...options })
}

async function failingRun(command, args, options = {}) {
  try {
    await run(command, args, options)
  } catch (error) {
    return error
  }
  throw new Error(`${command} unexpectedly succeeded`)
}

function healthRequest(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let buffer = ''
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('Timed out waiting for system.health'))
    }, 10_000)
    socket.once('error', reject)
    socket.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n').filter(Boolean)
      if (lines.length < 2) return
      clearTimeout(timeout)
      socket.end()
      try { resolve(JSON.parse(lines[1])) } catch (error) { reject(error) }
    })
    socket.once('connect', () => socket.write(`${JSON.stringify({
      id: 'handshake', method: 'system.handshake', params: { client: 'artifact-check', clientVersion: '1.0.0', protocolVersion: 1 }
    })}\n${JSON.stringify({ id: 'health', method: 'system.health', params: {} })}\n`))
  })
}

async function waitForHealth(socketPath) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const health = await healthRequest(socketPath)
      return health.result
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('Artifact backend did not become healthy')
}

try {
  await fs.writeFile(mockedNode, `#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then printf '%s\\n' 'v20.16.0'; exit 0; fi\nexec ${JSON.stringify(process.execPath)} \"$@\"\n`, { mode: 0o755 })

  const rejected = await failingRun(process.execPath, ['scripts/build-ggr-backend-artifact.mjs', '--version', version, '--output-dir', outputDirectory])
  assert.match(rejected.stderr, /Node v?20\.16\.0/, 'a production build must reject the local non-20.16.0 Node runtime')
  const releaseRejected = await failingRun(process.execPath, [
    'scripts/build-ggr-backend-artifact.mjs', '--version', version, '--output-dir', outputDirectory,
    '--unsigned-test', '--node-binary', mockedNode
  ], { env: { ...process.env, GGR_RELEASE_BUILD: '1' } })
  assert.match(releaseRejected.stderr, /cannot use --unsigned-test/, 'a release build must reject the unsigned-test escape hatch')

  await run(process.execPath, [
    'scripts/build-ggr-backend-artifact.mjs', '--version', version, '--output-dir', outputDirectory,
    '--unsigned-test', '--node-binary', mockedNode
  ])

  const archive = path.join(outputDirectory, `ggr-backend-${version}-darwin-${process.arch}.tar.gz`)
  await fs.access(archive)
  await run(process.execPath, [
    'scripts/build-ggr-backend-artifact.mjs', '--version', version, '--output-dir', repeatOutputDirectory,
    '--unsigned-test', '--node-binary', mockedNode
  ])
  assert.deepEqual(
    await fs.readFile(archive),
    await fs.readFile(path.join(repeatOutputDirectory, `ggr-backend-${version}-darwin-${process.arch}.tar.gz`)),
    'the deterministic pre-signing archives must be byte-identical'
  )
  const listed = (await run('tar', ['-tzf', archive])).stdout.split('\n')
  for (const expected of [
    'bin/node',
    'app/server.mjs',
    'app/package.json',
    'app/node_modules/better-sqlite3/',
    'app/node_modules/puppeteer/',
    'metadata/build.json'
  ]) assert(listed.some((entry) => entry === expected || entry.startsWith(expected)), `archive must include ${expected}`)

  await fs.mkdir(extractedDirectory)
  await run('tar', ['-xzf', archive, '-C', extractedDirectory])
  const build = JSON.parse(await fs.readFile(path.join(extractedDirectory, 'metadata', 'build.json'), 'utf8'))
  assert.deepEqual(build, {
    version,
    platform: 'darwin',
    arch: process.arch,
    nodeVersion: 'v20.16.0',
    archiveReproducibility: 'pre-signing-byte-identical'
  })
  const browserDependencyCheck = await run(path.join(extractedDirectory, 'bin', 'node'), [
    '--input-type=module', '--eval',
    "await import('./app/lib/services/browser/runtime.mjs'); const { initPuppeteer } = await import('./app/node_modules/@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'); const { puppeteer, LaodengPlugin } = await initPuppeteer(); if (!puppeteer || !LaodengPlugin) throw new Error('browser runtime dependencies are unavailable')"
  ], { cwd: extractedDirectory })
  assert.equal(browserDependencyCheck.stderr, '', 'artifact browser runtime import must not report dependency errors')

  const backend = spawn(path.join(extractedDirectory, 'bin', 'node'), ['app/server.mjs'], {
    cwd: extractedDirectory,
    env: { ...process.env, HOME: homeDirectory },
    stdio: 'ignore'
  })
  try {
    const health = await waitForHealth(path.join(homeDirectory, '.geekgeekrun', 'run', 'backend.sock'))
    assert.deepEqual(health, { ready: true, version, protocolVersion: 1 })
  } finally {
    backend.kill('SIGTERM')
    await new Promise((resolve) => backend.once('exit', resolve))
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const manifestPath = path.join(outputDirectory, 'manifest.json')
  const signaturePath = path.join(outputDirectory, 'manifest.sig')
  await run(process.execPath, ['scripts/sign-ggr-backend-manifest.mjs', '--manifest', manifestPath, '--signature', signaturePath], {
    env: { ...process.env, GGR_UPDATE_PRIVATE_KEY: privateKeyPem }
  })
  const manifest = await fs.readFile(manifestPath)
  const signature = Buffer.from((await fs.readFile(signaturePath, 'utf8')).trim(), 'base64')
  assert(verify(null, manifest, publicKey, signature), 'manifest signature must verify the final raw manifest bytes')
  assert.equal(
    JSON.parse(manifest).artifacts[0].sha256,
    createHash('sha256').update(await fs.readFile(archive)).digest('hex'),
    'a published release artifact is verified by the signed manifest digest, not reproducible byte identity after timestamped codesigning'
  )
  const altered = Buffer.from(manifest)
  altered[0] ^= 1
  assert(!verify(null, altered, publicKey, signature), 'manifest signature must reject a single-byte mutation')
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}

console.log('ggr-backend artifact check passed')
