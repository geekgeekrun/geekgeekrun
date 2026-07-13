import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DIRECTORY_MODE = 0o700
const FILE_MODE = 0o600

function assertVersion(version) {
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(version) || version === '.' || version === '..') {
    throw new TypeError('Version is not a safe directory name')
  }
}

async function lstatOrNull(target) { return fs.lstat(target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)) }

async function syncPath(target) {
  let handle
  try { handle = await fs.open(target, 'r'); await handle.sync() } finally { await handle?.close() }
}

async function ensureDirectory(target) {
  await fs.mkdir(target, { recursive: true, mode: DIRECTORY_MODE })
  const info = await fs.lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a real directory: ${target}`)
  await fs.chmod(target, DIRECTORY_MODE)
  await syncPath(target)
}

async function syncTree(target) {
  const info = await fs.lstat(target)
  if (info.isSymbolicLink()) throw new Error(`Symbolic links are not permitted in staged artifacts: ${target}`)
  if (info.isFile()) { await syncPath(target); return }
  if (!info.isDirectory()) throw new Error(`Unsupported staged file type: ${target}`)
  for (const name of await fs.readdir(target)) await syncTree(path.join(target, name))
  await syncPath(target)
}

async function validateRuntimeTree(target) {
  for (const relative of ['bin/node', 'app/server.mjs']) {
    const info = await lstatOrNull(path.join(target, relative))
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`Staged artifact is missing regular ${relative}`)
  }
}

export function createVersionStore(runtimeDir) {
  if (!path.isAbsolute(runtimeDir)) throw new TypeError('runtimeDir must be absolute')
  const versionsDir = path.join(runtimeDir, 'versions')
  const stagingDir = path.join(runtimeDir, '.staging')
  const currentLink = path.join(runtimeDir, 'current')
  const previousLink = path.join(runtimeDir, 'previous')

  async function prepareLayout() {
    await ensureDirectory(runtimeDir)
    await ensureDirectory(versionsDir)
    await ensureDirectory(stagingDir)
  }

  async function linkedVersion(link) {
    const info = await lstatOrNull(link)
    if (!info) return null
    if (!info.isSymbolicLink()) throw new Error(`Version pointer is not a symbolic link: ${link}`)
    const destination = await fs.readlink(link)
    const resolved = path.resolve(path.dirname(link), destination)
    const relative = path.relative(versionsDir, resolved)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
      throw new Error(`Version pointer escapes versions directory: ${link}`)
    }
    assertVersion(relative)
    const versionInfo = await fs.lstat(resolved)
    if (!versionInfo.isDirectory() || versionInfo.isSymbolicLink()) throw new Error(`Version pointer does not target a real version: ${link}`)
    return relative
  }

  async function replaceLink(link, version) {
    const temporary = `${link}.next-${randomUUID()}`
    await fs.symlink(path.join('versions', version), temporary)
    await syncPath(runtimeDir)
    await fs.rename(temporary, link)
    await syncPath(runtimeDir)
  }

  async function removeLink(link) {
    const info = await lstatOrNull(link)
    if (!info) return
    if (!info.isSymbolicLink()) throw new Error(`Refusing to remove non-link version pointer: ${link}`)
    await fs.unlink(link)
    await syncPath(runtimeDir)
  }

  async function stage(version, prepare) {
    assertVersion(version)
    if (typeof prepare !== 'function') throw new TypeError('stage requires a preparation function')
    await prepareLayout()
    const destination = path.join(versionsDir, version)
    if (await lstatOrNull(destination)) throw new Error(`Version already exists: ${version}`)
    const temporary = path.join(stagingDir, `${version}-${randomUUID()}`)
    await fs.mkdir(temporary, { mode: DIRECTORY_MODE })
    try {
      await prepare(temporary)
      await validateRuntimeTree(temporary)
      await syncTree(temporary)
      await fs.rename(temporary, destination)
      await syncPath(versionsDir)
      return destination
    } catch (error) {
      await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async function activate(version) {
    assertVersion(version)
    await prepareLayout()
    const target = path.join(versionsDir, version)
    const info = await lstatOrNull(target)
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Cannot activate unavailable version: ${version}`)
    const old = await linkedVersion(currentLink)
    if (old === version) return version
    // Persist previous first; only then atomically replace current with current.next.
    if (old) await replaceLink(previousLink, old)
    else await removeLink(previousLink)
    const next = `${currentLink}.next`
    await fs.rm(next, { force: true }).catch(() => {})
    await fs.symlink(path.join('versions', version), next)
    await syncPath(runtimeDir)
    await fs.rename(next, currentLink)
    await syncPath(runtimeDir)
    return version
  }

  async function rollback() {
    await prepareLayout()
    const current = await linkedVersion(currentLink)
    const prior = await linkedVersion(previousLink)
    if (!current || !prior) throw new Error('No previous version is available for rollback')
    await replaceLink(previousLink, current)
    const next = `${currentLink}.next`
    await fs.rm(next, { force: true }).catch(() => {})
    await fs.symlink(path.join('versions', prior), next)
    await syncPath(runtimeDir)
    await fs.rename(next, currentLink)
    await syncPath(runtimeDir)
    return prior
  }

  async function current() { await prepareLayout(); return linkedVersion(currentLink) }
  async function previous() { await prepareLayout(); return linkedVersion(previousLink) }

  async function prune() {
    await prepareLayout()
    const keep = new Set([await linkedVersion(currentLink), await linkedVersion(previousLink)].filter(Boolean))
    for (const entry of await fs.readdir(versionsDir)) {
      assertVersion(entry)
      if (keep.has(entry)) continue
      const target = path.join(versionsDir, entry)
      const info = await fs.lstat(target)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing to prune unsupported version entry: ${target}`)
      await fs.rm(target, { recursive: true, force: false })
    }
    await syncPath(versionsDir)
  }

  return Object.freeze({ runtimeDir, versionsDir, stagingDir, stage, activate, rollback, current, previous, prune })
}
