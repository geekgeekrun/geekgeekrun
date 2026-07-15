import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DIRECTORY_MODE = 0o700

function assertVersion(version) {
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(version) || version === '.' || version === '..') {
    throw new TypeError('Version is not a safe directory name')
  }
}

async function lstatOrNull(ops, target) { return ops.lstat(target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)) }

async function syncPath(ops, target) {
  let handle
  try { handle = await ops.open(target, 'r'); await handle.sync() } finally { await handle?.close() }
}

async function ensureDirectory(ops, target) {
  await ops.mkdir(target, { recursive: true, mode: DIRECTORY_MODE })
  const info = await ops.lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a real directory: ${target}`)
  await ops.chmod(target, DIRECTORY_MODE)
  await syncPath(ops, target)
}

async function syncTree(ops, target) {
  const info = await ops.lstat(target)
  if (info.isSymbolicLink()) throw new Error(`Symbolic links are not permitted in staged artifacts: ${target}`)
  if (info.isFile()) { await syncPath(ops, target); return }
  if (!info.isDirectory()) throw new Error(`Unsupported staged file type: ${target}`)
  for (const name of await ops.readdir(target)) await syncTree(ops, path.join(target, name))
  await syncPath(ops, target)
}

async function validateRuntimeTree(ops, target) {
  for (const relative of ['bin/node', 'app/server.mjs']) {
    const info = await lstatOrNull(ops, path.join(target, relative))
    if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`Staged artifact is missing regular ${relative}`)
  }
}

export function createVersionStore(runtimeDir, { fsOps = fs } = {}) {
  if (!path.isAbsolute(runtimeDir)) throw new TypeError('runtimeDir must be absolute')
  const ops = fsOps
  const versionsDir = path.join(runtimeDir, 'versions')
  const stagingDir = path.join(runtimeDir, '.staging')
  const currentLink = path.join(runtimeDir, 'current')
  const previousLink = path.join(runtimeDir, 'previous')
  const currentNext = `${currentLink}.next`
  const previousNext = `${previousLink}.next`
  const journalPath = path.join(runtimeDir, '.version-pointer-transaction.json')

  async function prepareLayout() {
    await ensureDirectory(ops, runtimeDir)
    await ensureDirectory(ops, versionsDir)
    await ensureDirectory(ops, stagingDir)
  }

  async function linkedVersion(link) {
    const info = await lstatOrNull(ops, link)
    if (!info) return null
    if (!info.isSymbolicLink()) throw new Error(`Version pointer is not a symbolic link: ${link}`)
    const destination = await ops.readlink(link)
    const resolved = path.resolve(path.dirname(link), destination)
    const relative = path.relative(versionsDir, resolved)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
      throw new Error(`Version pointer escapes versions directory: ${link}`)
    }
    assertVersion(relative)
    const versionInfo = await ops.lstat(resolved)
    if (!versionInfo.isDirectory() || versionInfo.isSymbolicLink()) throw new Error(`Version pointer does not target a real version: ${link}`)
    return relative
  }

  async function assertAbsent(target) {
    if (await lstatOrNull(ops, target)) throw new Error(`Version pointer transaction collision: ${target}`)
  }

  async function createPointer(link, version) {
    assertVersion(version)
    await ops.symlink(path.join('versions', version), link)
    await syncPath(ops, runtimeDir)
  }

  async function removeExpectedPointer(link, expectedVersion) {
    const found = await lstatOrNull(ops, link)
    if (!found) return
    if (!found.isSymbolicLink() || await linkedVersion(link) !== expectedVersion) throw new Error(`Unexpected pointer transaction entry: ${link}`)
    await ops.unlink(link)
    await syncPath(ops, runtimeDir)
  }

  async function writeJournal(transaction) {
    const temporary = `${journalPath}.${randomUUID()}.next`
    const handle = await ops.open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(transaction))
      await handle.sync()
    } finally { await handle.close() }
    await ops.rename(temporary, journalPath)
    await syncPath(ops, runtimeDir)
  }

  async function removeJournal() {
    await ops.rm(journalPath, { force: true })
    await syncPath(ops, runtimeDir)
  }

  async function readJournal() {
    const raw = await ops.readFile(journalPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!raw) return null
    let transaction
    try { transaction = JSON.parse(raw) } catch { throw new Error('Version pointer transaction journal is invalid') }
    if (!transaction || typeof transaction !== 'object') throw new Error('Version pointer transaction journal is invalid')
    for (const field of ['oldCurrent', 'oldPrevious', 'newCurrent', 'newPrevious']) {
      if (transaction[field] !== null) assertVersion(transaction[field])
    }
    if (typeof transaction.newCurrent !== 'string') throw new Error('Version pointer transaction journal is invalid')
    return transaction
  }

  async function recoverPointers() {
    const transaction = await readJournal()
    if (!transaction) {
      if (await lstatOrNull(ops, currentNext) || await lstatOrNull(ops, previousNext)) {
        throw new Error('Unjournaled version pointer transaction collision')
      }
      return
    }
    const current = await linkedVersion(currentLink)
    const previous = await linkedVersion(previousLink)
    if (current === transaction.oldCurrent) {
      if (previous !== transaction.oldPrevious) throw new Error('Version pointer transaction cannot be safely rolled back')
      await removeExpectedPointer(currentNext, transaction.newCurrent)
      if (transaction.newPrevious) await removeExpectedPointer(previousNext, transaction.newPrevious)
      await removeJournal()
      return
    }
    if (current !== transaction.newCurrent) throw new Error('Version pointer transaction has an unexpected current target')
    if (previous === transaction.newPrevious) {
      await removeExpectedPointer(currentNext, transaction.newCurrent)
      await removeExpectedPointer(previousNext, transaction.newPrevious)
      await removeJournal()
      return
    }
    if (previous !== transaction.oldPrevious || !transaction.newPrevious) throw new Error('Version pointer transaction cannot be safely completed')
    if (await linkedVersion(previousNext) !== transaction.newPrevious) throw new Error('Version pointer transaction lost its recoverable previous target')
    await ops.rename(previousNext, previousLink)
    await syncPath(ops, runtimeDir)
    await removeExpectedPointer(currentNext, transaction.newCurrent)
    await removeJournal()
  }

  async function ready() { await prepareLayout(); await recoverPointers() }

  async function stage(version, prepare, { signal } = {}) {
    const throwIfAborted = () => {
      if (signal?.aborted) throw signal.reason ?? Object.assign(new Error('Version staging was cancelled'), { code: 'INSTALL_DEADLINE_EXCEEDED' })
    }
    assertVersion(version)
    if (typeof prepare !== 'function') throw new TypeError('stage requires a preparation function')
    throwIfAborted()
    await ready()
    const destination = path.join(versionsDir, version)
    if (await lstatOrNull(ops, destination)) throw new Error(`Version already exists: ${version}`)
    const temporary = path.join(stagingDir, `${version}-${randomUUID()}`)
    await ops.mkdir(temporary, { mode: DIRECTORY_MODE })
    let committed = false
    let discardedCommittedDestination = false
    const discardCommittedDestination = async () => {
      const info = await lstatOrNull(ops, destination)
      if (!info) return
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing to remove unsafe aborted staging destination: ${destination}`)
      await ops.rm(destination, { recursive: true, force: false })
      await syncPath(ops, versionsDir)
      discardedCommittedDestination = true
    }
    try {
      await prepare(temporary)
      throwIfAborted()
      await validateRuntimeTree(ops, temporary)
      throwIfAborted()
      await syncTree(ops, temporary)
      throwIfAborted()
      await ops.rename(temporary, destination)
      committed = true
      if (signal?.aborted) {
        await discardCommittedDestination()
        throwIfAborted()
      }
      await syncPath(ops, versionsDir)
      if (signal?.aborted) {
        await discardCommittedDestination()
        throwIfAborted()
      }
      return destination
    } catch (error) {
      if (committed && signal?.aborted && !discardedCommittedDestination) await discardCommittedDestination().catch(() => {})
      await ops.rm(temporary, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async function swapPointers(newCurrent, newPrevious) {
    const oldCurrent = await linkedVersion(currentLink)
    const oldPrevious = await linkedVersion(previousLink)
    await assertAbsent(currentNext)
    await assertAbsent(previousNext)
    const transaction = { oldCurrent, oldPrevious, newCurrent, newPrevious }
    await writeJournal(transaction)
    try {
      await createPointer(currentNext, newCurrent)
      if (newPrevious) await createPointer(previousNext, newPrevious)
      // The current pointer is the commit point. The old previous pointer stays
      // untouched until this atomic rename succeeds.
      await ops.rename(currentNext, currentLink)
      await syncPath(ops, runtimeDir)
      if (newPrevious) {
        await ops.rename(previousNext, previousLink)
        await syncPath(ops, runtimeDir)
      } else if (oldPrevious) {
        await ops.unlink(previousLink)
        await syncPath(ops, runtimeDir)
      }
      await removeJournal()
    } catch (error) {
      // The journal and untouched old pointer(s) make this operation
      // recoverable. Do not clobber a pointer while trying to handle failure.
      throw error
    }
  }

  async function activate(version) {
    assertVersion(version)
    await ready()
    const target = path.join(versionsDir, version)
    const info = await lstatOrNull(ops, target)
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Cannot activate unavailable version: ${version}`)
    const old = await linkedVersion(currentLink)
    if (old === version) return version
    await swapPointers(version, old)
    return version
  }

  async function rollback() {
    await ready()
    const current = await linkedVersion(currentLink)
    const prior = await linkedVersion(previousLink)
    if (!current || !prior) throw new Error('No previous version is available for rollback')
    await swapPointers(prior, current)
    return prior
  }

  // Rehearsal happens after staging but before activation.  A failed
  // rehearsal must not poison the version name and prevent a corrected
  // artifact from being staged on the next attempt.
  async function discard(version) {
    assertVersion(version)
    await ready()
    if (version === await linkedVersion(currentLink) || version === await linkedVersion(previousLink)) {
      throw new Error(`Refusing to discard an active version: ${version}`)
    }
    const target = path.join(versionsDir, version)
    const info = await lstatOrNull(ops, target)
    if (!info) return false
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing to discard unsafe version entry: ${target}`)
    await ops.rm(target, { recursive: true, force: false })
    await syncPath(ops, versionsDir)
    return true
  }

  async function current() { await ready(); return linkedVersion(currentLink) }
  async function previous() { await ready(); return linkedVersion(previousLink) }

  async function prune() {
    await ready()
    const keep = new Set([await linkedVersion(currentLink), await linkedVersion(previousLink)].filter(Boolean))
    for (const entry of await ops.readdir(versionsDir)) {
      assertVersion(entry)
      if (keep.has(entry)) continue
      const target = path.join(versionsDir, entry)
      const info = await ops.lstat(target)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Refusing to prune unsupported version entry: ${target}`)
      await ops.rm(target, { recursive: true, force: false })
    }
    await syncPath(ops, versionsDir)
  }

  return Object.freeze({ runtimeDir, versionsDir, stagingDir, stage, activate, rollback, discard, current, previous, prune })
}
