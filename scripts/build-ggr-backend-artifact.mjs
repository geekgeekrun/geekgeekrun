import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'

const execFile = promisify(execFileCallback)
const NODE_VERSION = 'v20.16.0'
const PROTOCOL_VERSION = 1
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function fail(message) {
  throw new Error(`ggr-backend artifact: ${message}`)
}

function parseArguments(argv) {
  const options = { channel: 'stable' }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--unsigned-test') {
      options.unsignedTest = true
      continue
    }
    if (!['--version', '--output-dir', '--node-binary', '--channel', '--base-url', '--codesign-identity'].includes(argument)) fail(`unknown argument ${argument}`)
    const value = argv[++index]
    if (!value || value.startsWith('--')) fail(`${argument} requires a value`)
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
  }
  if (!options.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(options.version)) fail('version must be a semantic version')
  if (!options.outputDir) options.outputDir = path.join(repoRoot, 'dist', 'ggr-backend', options.version)
  if (options.nodeBinary && !options.unsignedTest) fail('--node-binary is only permitted with --unsigned-test')
  if (options.unsignedTest && !options.nodeBinary) fail('--unsigned-test requires an injected --node-binary')
  if (options.unsignedTest && process.env.GGR_RELEASE_BUILD === '1') fail('a release build cannot use --unsigned-test')
  return options
}

async function runtimeNode(options) {
  if (!options.unsignedTest) {
    if (process.version !== NODE_VERSION) fail(`requires Node ${NODE_VERSION}; received ${process.version}`)
    return process.execPath
  }
  const { stdout } = await execFile(options.nodeBinary, ['--version'])
  if (stdout.trim() !== NODE_VERSION) fail(`unsigned test node must report ${NODE_VERSION}; received ${stdout.trim() || 'no version'}`)
  return options.nodeBinary
}

async function removeBuildOnlyFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['.cache', 'test', 'tests', '__tests__'].includes(entry.name)) {
        await fs.rm(target, { recursive: true, force: true })
      } else {
        await removeBuildOnlyFiles(target)
      }
    }
  }
}

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`
}

function text(value, length) {
  const bytes = Buffer.from(value)
  if (bytes.length > length) fail(`tar path is too long: ${value}`)
  const target = Buffer.alloc(length)
  bytes.copy(target)
  return target
}

function tarPath(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' }
  const parts = name.split('/')
  for (let index = 1; index < parts.length; index++) {
    const prefix = parts.slice(0, index).join('/')
    const basename = parts.slice(index).join('/')
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(basename) <= 100) return { name: basename, prefix }
  }
  fail(`tar path is too long: ${name}`)
}

function tarHeader({ name, mode, size = 0, type = '0', linkname = '' }) {
  const header = Buffer.alloc(512)
  const target = tarPath(name)
  text(target.name, 100).copy(header, 0)
  text(octal(mode, 8), 8).copy(header, 100)
  text(octal(0, 8), 8).copy(header, 108)
  text(octal(0, 8), 8).copy(header, 116)
  text(octal(size, 12), 12).copy(header, 124)
  text(octal(0, 12), 12).copy(header, 136)
  header.fill(0x20, 148, 156)
  header[156] = type.charCodeAt(0)
  text(linkname, 100).copy(header, 157)
  text('ustar\0', 6).copy(header, 257)
  text('00', 2).copy(header, 263)
  text(target.prefix, 155).copy(header, 345)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  text(octal(checksum, 8), 8).copy(header, 148)
  return header
}

async function archiveEntries(root, relative = '') {
  const directory = path.join(root, relative)
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)))) {
    const child = path.posix.join(relative, entry.name)
    const absolute = path.join(root, child)
    const stat = await fs.lstat(absolute)
    if (stat.isDirectory()) {
      result.push({ name: `${child}/`, mode: stat.mode & 0o777, type: '5' })
      result.push(...await archiveEntries(root, child))
    } else if (stat.isSymbolicLink()) {
      result.push({ name: child, mode: stat.mode & 0o777, type: '2', linkname: await fs.readlink(absolute) })
    } else if (stat.isFile()) {
      result.push({ name: child, mode: stat.mode & 0o777, type: '0', content: await fs.readFile(absolute) })
    } else {
      fail(`refusing to archive non-regular entry ${child}`)
    }
  }
  return result
}

async function writeDeterministicArchive(stagingDirectory, archivePath) {
  const chunks = []
  for (const entry of await archiveEntries(stagingDirectory)) {
    const content = entry.content ?? Buffer.alloc(0)
    chunks.push(tarHeader({ ...entry, size: content.length }))
    if (content.length) {
      chunks.push(content)
      const padding = (512 - (content.length % 512)) % 512
      if (padding) chunks.push(Buffer.alloc(padding))
    }
  }
  chunks.push(Buffer.alloc(1024))
  await fs.writeFile(archivePath, gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 }))
}

async function extractedSize(directory) {
  let total = 0
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += await extractedSize(target)
    else if (entry.isFile()) total += (await fs.lstat(target)).size
  }
  return total
}

async function assertArtifactLayout(stagingDirectory) {
  const layout = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages', 'ggr-backend', 'artifact-layout.json'), 'utf8'))
  for (const entry of layout.entries ?? []) {
    const target = path.join(stagingDirectory, entry.replace(/\/$/, ''))
    const stat = await fs.stat(target).catch(() => null)
    if (!stat || (entry.endsWith('/') && !stat.isDirectory())) fail(`required layout entry is missing: ${entry}`)
  }
}

async function codesignNativeExecutables(stagingDirectory, identity) {
  const candidates = []
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile() && (target.endsWith('.node') || target === path.join(stagingDirectory, 'bin', 'node'))) candidates.push(target)
    }
  }
  await visit(stagingDirectory)
  for (const target of candidates.sort()) {
    await execFile('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, target])
  }
}

async function build(options) {
  if (process.platform !== 'darwin') fail(`only darwin artifacts are supported; received ${process.platform}`)
  const nodeBinary = await runtimeNode(options)
  const arch = process.arch
  const stagingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-backend-artifact-'))
  const appDirectory = path.join(stagingDirectory, 'app')
  const outputDirectory = path.resolve(options.outputDir)
  const fileName = `ggr-backend-${options.version}-darwin-${arch}.tar.gz`
  try {
    await execFile('pnpm', ['--filter', '@geekgeekrun/ggr-backend', 'deploy', '--prod', appDirectory], {
      cwd: repoRoot,
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' }
    })
    const packagePath = path.join(appDirectory, 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'))
    packageJson.version = options.version
    await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
    await removeBuildOnlyFiles(appDirectory)
    await fs.mkdir(path.join(stagingDirectory, 'bin'), { recursive: true })
    await fs.copyFile(nodeBinary, path.join(stagingDirectory, 'bin', 'node'))
    await fs.chmod(path.join(stagingDirectory, 'bin', 'node'), (await fs.stat(nodeBinary)).mode & 0o777)
    if (options.codesignIdentity) await codesignNativeExecutables(stagingDirectory, options.codesignIdentity)
    // Timestamped macOS code signatures intentionally make release archives
    // non-reproducible. Only the archive before codesigning is byte-identical.
    const metadata = {
      version: options.version,
      platform: 'darwin',
      arch,
      nodeVersion: NODE_VERSION,
      archiveReproducibility: options.codesignIdentity ? 'signed-release-integrity-only' : 'pre-signing-byte-identical'
    }
    await fs.mkdir(path.join(stagingDirectory, 'metadata'), { recursive: true })
    await fs.writeFile(path.join(stagingDirectory, 'metadata', 'build.json'), `${JSON.stringify(metadata, null, 2)}\n`)
    await assertArtifactLayout(stagingDirectory)

    await fs.mkdir(outputDirectory, { recursive: true })
    const archivePath = path.join(outputDirectory, fileName)
    await writeDeterministicArchive(stagingDirectory, archivePath)
    const archive = await fs.readFile(archivePath)
    const artifact = {
      filename: fileName,
      platform: 'darwin',
      arch,
      url: `${options.baseUrl ?? `https://github.com/geekgeekrun/geekgeekrun/releases/download/ggr-backend-v${options.version}`}/${fileName}`,
      size: archive.length,
      extractionSize: await extractedSize(stagingDirectory),
      sha256: createHash('sha256').update(archive).digest('hex')
    }
    const manifest = {
      version: options.version,
      channel: options.channel,
      protocolMin: PROTOCOL_VERSION,
      protocolMax: PROTOCOL_VERSION,
      minClientVersion: '1.0.0',
      database: { schemaVersion: 0, rollbackCompatible: true, rehearsalEntrypoint: 'app/migration.mjs' },
      artifacts: [artifact]
    }
    await fs.writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true })
  }
}

await build(parseArguments(process.argv.slice(2)))
