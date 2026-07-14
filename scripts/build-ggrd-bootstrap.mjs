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

function runtimeDetails() {
  if (!platform || !arch) throw new Error(`ggrd bootstrap does not support ${process.platform}-${process.arch}`)
  const directory = `node-${NODE_VERSION}-${platform}-${arch}`
  return { directory, archive: `${directory}.tar.gz`, url: `https://nodejs.org/dist/${NODE_VERSION}/${directory}.tar.gz`, sumsUrl: `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt` }
}

async function regularFile(file) {
  const entry = await fs.lstat(file).catch(() => null)
  return Boolean(entry?.isFile() && !entry.isSymbolicLink())
}

async function nodeDistribution() {
  const details = runtimeDetails()
  const cache = path.join(os.homedir(), '.cache', 'geekgeekrun', 'node-runtime', details.directory)
  const cachedNode = path.join(cache, 'bin', 'node')
  if (await regularFile(cachedNode)) return cache
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-node-runtime-'))
  try {
    const archive = path.join(temporary, details.archive)
    const sums = path.join(temporary, 'SHASUMS256.txt')
    await execFile('curl', ['--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', sums, details.sumsUrl])
    await execFile('curl', ['--fail', '--location', '--proto', '=https', '--tlsv1.2', '--output', archive, details.url])
    const expected = (await fs.readFile(sums, 'utf8')).split('\n').find((line) => line.endsWith(`  ${details.archive}`))?.split(/\s+/)[0]
    const actual = createHash('sha256').update(await fs.readFile(archive)).digest('hex')
    if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || actual !== expected.toLowerCase()) throw new Error(`Node ${NODE_VERSION} archive checksum verification failed`)
    await execFile('tar', ['-xzf', archive, '-C', temporary])
    const extracted = path.join(temporary, details.directory)
    if (!await regularFile(path.join(extracted, 'bin', 'node'))) throw new Error('downloaded Node distribution has no regular bin/node')
    await fs.mkdir(path.dirname(cache), { recursive: true, mode: 0o700 })
    await fs.rm(cache, { recursive: true, force: true })
    await fs.cp(extracted, cache, { recursive: true, dereference: true, errorOnExist: true })
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
  await fs.writeFile(path.join(output, 'runtime.json'), `${JSON.stringify({ node: NODE_VERSION, platform: process.platform, arch: process.arch, layout: 'node-distribution', source: runtimeDetails().url })}\n`, { mode: 0o600 })
}

await copySupervisorSource()
console.log(`built ggrd bootstrap with pinned runtime ${NODE_VERSION}`)
