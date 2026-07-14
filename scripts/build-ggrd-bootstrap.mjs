import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

const execFile = promisify(execFileCallback)
const repository = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(repository, 'packages', 'ui', 'resources', 'ggrd-bootstrap')
const ggrd = path.join(repository, 'packages', 'ggrd')
const protocol = path.join(repository, 'packages', 'ggr-protocol')
const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null
const arch = process.arch === 'arm64' || process.arch === 'x64' ? process.arch : null
const NODE_VERSION = 'v20.16.0'
// These are release artifacts pinned in the repository, not a checksum read
// from the same endpoint as a potentially substituted download.
const NODE_DARWIN_SHA256 = Object.freeze({
  arm64: 'fc7355e778b181575153b7dea4879e8021776eeb376c43c50f65893d2ea70aa3',
  x64: 'e18942cd706e4d69a4845ddacee2f1c17a72e853a229e3d2623d2edeb7efde72'
})

function runtimeDetails() {
  if (!platform || !arch) throw new Error(`ggrd bootstrap does not support ${process.platform}-${process.arch}`)
  const directory = `node-${NODE_VERSION}-${platform}-${arch}`
  const sha256 = platform === 'darwin' ? NODE_DARWIN_SHA256[arch] : null
  if (!sha256) throw new Error(`ggrd bootstrap has no trusted Node digest for ${platform}-${arch}`)
  return { directory, archive: `${directory}.tar.gz`, url: `https://nodejs.org/dist/${NODE_VERSION}/${directory}.tar.gz`, sha256 }
}

async function regularFile(file) {
  const entry = await fs.lstat(file).catch(() => null)
  return Boolean(entry?.isFile() && !entry.isSymbolicLink())
}

async function nodeDistribution() {
  const details = runtimeDetails()
  const cache = path.join(os.homedir(), '.cache', 'geekgeekrun', 'node-runtime', details.directory)
  const cachedNode = path.join(cache, 'bin', 'node')
  const cachedArchive = path.join(cache, details.archive)
  if (await regularFile(cachedNode) && await regularFile(cachedArchive)) {
    const digest = createHash('sha256').update(await fs.readFile(cachedArchive)).digest('hex')
    if (digest === details.sha256) return cache
    await fs.rm(cache, { recursive: true, force: true })
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-node-runtime-'))
  try {
    const archive = path.join(temporary, details.archive)
    await execFile('curl', ['--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', archive, details.url])
    const actual = createHash('sha256').update(await fs.readFile(archive)).digest('hex')
    if (actual !== details.sha256) throw new Error(`Node ${NODE_VERSION} archive checksum verification failed`)
    await execFile('tar', ['-xzf', archive, '-C', temporary])
    const extracted = path.join(temporary, details.directory)
    if (!await regularFile(path.join(extracted, 'bin', 'node'))) throw new Error('downloaded Node distribution has no regular bin/node')
    await fs.mkdir(path.dirname(cache), { recursive: true, mode: 0o700 })
    await fs.rm(cache, { recursive: true, force: true })
    await fs.cp(extracted, cache, { recursive: true, dereference: true, errorOnExist: true })
    await fs.copyFile(archive, path.join(cache, details.archive))
    return cache
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

async function copySupervisorSource() {
  const runtime = await nodeDistribution()
  await fs.rm(output, { recursive: true, force: true })
  await fs.cp(ggrd, output, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}test${path.sep}`) && !source.endsWith(`${path.sep}test`) && !source.includes(`${path.sep}node_modules${path.sep}`) && !source.endsWith(`${path.sep}node_modules`)
  })
  await fs.mkdir(path.join(output, 'node_modules', '@geekgeekrun'), { recursive: true, mode: 0o700 })
  await fs.cp(protocol, path.join(output, 'node_modules', '@geekgeekrun', 'ggr-protocol'), { recursive: true })
  const embeddedRuntime = path.join(output, 'runtime')
  await fs.mkdir(embeddedRuntime, { recursive: true, mode: 0o700 })
  for (const component of ['bin', 'lib']) {
    const source = path.join(runtime, component)
    if (await fs.lstat(source).catch(() => null)) await fs.cp(source, path.join(embeddedRuntime, component), { recursive: true, dereference: true })
  }
  const node = path.join(output, 'runtime', 'bin', 'node')
  if (!await regularFile(node)) throw new Error('bootstrap runtime copy is incomplete')
  await fs.chmod(node, (await fs.stat(node)).mode & 0o777)
  const embeddedVersion = (await execFile(node, ['--version'])).stdout.trim()
  if (embeddedVersion !== NODE_VERSION) throw new Error(`bootstrap runtime must be ${NODE_VERSION}; received ${embeddedVersion || 'no version'}`)
  const details = runtimeDetails()
  await fs.writeFile(path.join(output, 'runtime.json'), `${JSON.stringify({ node: NODE_VERSION, platform: process.platform, arch: process.arch, layout: 'node-distribution', source: details.url, sha256: details.sha256 })}\n`, { mode: 0o600 })
}

await copySupervisorSource()
console.log(`built ggrd bootstrap with pinned runtime ${NODE_VERSION}`)
