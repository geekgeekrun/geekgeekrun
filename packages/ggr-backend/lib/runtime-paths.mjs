import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const LAYOUT_VERSION = '1\n'

export function createRuntimePaths(homeDir) {
  if (!path.isAbsolute(homeDir)) throw new TypeError('homeDir must be an absolute path')
  const rootDir = path.join(homeDir, '.geekgeekrun')
  const dataDir = path.join(rootDir, 'data')
  const runtimeDir = path.join(rootDir, 'runtime')
  const runDir = path.join(rootDir, 'run')
  const logsDir = path.join(rootDir, 'logs')
  return Object.freeze({
    rootDir, runtimeDir, runDir, dataDir, logsDir,
    configDir: path.join(dataDir, 'config'),
    storageDir: path.join(dataDir, 'storage'),
    databaseFile: path.join(dataDir, 'database.sqlite'),
    layoutVersionFile: path.join(dataDir, '.layout-version'),
    backendSocket: path.join(runDir, 'backend.sock'),
    backendLog: path.join(logsDir, 'backend.jsonl')
  })
}

async function lstatOrNull(ops, target) {
  return ops.lstat(target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
}

async function syncPath(ops, target) {
  const handle = await ops.open(target, 'r')
  try { await handle.sync() } finally { await handle.close() }
}

async function syncParent(ops, target) { await syncPath(ops, path.dirname(target)) }

async function privateDirectory(ops, directory) {
  const existed = await lstatOrNull(ops, directory)
  await ops.mkdir(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  await ops.chmod(directory, PRIVATE_DIR_MODE)
  await syncPath(ops, directory)
  if (!existed) await syncParent(ops, directory)
}

async function durableRename(ops, source, destination) {
  await ops.rename(source, destination)
  await syncParent(ops, destination)
  if (path.dirname(source) !== path.dirname(destination)) await syncParent(ops, source)
}

async function durableSymlink(ops, destination, linkPath) {
  await ops.symlink(destination, linkPath)
  await syncParent(ops, linkPath)
}

async function durableRemove(ops, target, options) {
  if (!await lstatOrNull(ops, target)) return
  await ops.rm(target, options)
  await syncParent(ops, target)
}

function symlinkError(target) { return new Error(`Refusing to migrate symbolic link: ${target}`) }

async function validateLegacyTree(ops, target, { excludePublicDb = false } = {}) {
  const info = await ops.lstat(target)
  if (info.isSymbolicLink()) throw symlinkError(target)
  if (info.isDirectory()) {
    for (const entry of await ops.readdir(target)) {
      if (!excludePublicDb || entry !== 'public.db') await validateLegacyTree(ops, path.join(target, entry))
    }
    return
  }
  if (!info.isFile()) throw new Error(`Unsupported legacy file type: ${target}`)
}

async function validateMigratedTree(ops, target, allowedLinks = new Map()) {
  const info = await ops.lstat(target)
  if (info.isSymbolicLink()) {
    const expected = allowedLinks.get(target)
    if (!expected) throw symlinkError(target)
    await validateSymlink(ops, target, expected)
    return
  }
  if (info.isDirectory()) {
    for (const entry of await ops.readdir(target)) await validateMigratedTree(ops, path.join(target, entry), allowedLinks)
    return
  }
  if (!info.isFile()) throw new Error(`Unsupported migrated file type: ${target}`)
}

async function copyPrivateTree(ops, source, destination) {
  const info = await ops.lstat(source)
  if (info.isSymbolicLink()) throw symlinkError(source)
  if (info.isDirectory()) {
    await privateDirectory(ops, destination)
    for (const entry of await ops.readdir(source)) await copyPrivateTree(ops, path.join(source, entry), path.join(destination, entry))
    await syncPath(ops, destination)
    return
  }
  if (!info.isFile()) throw new Error(`Unsupported legacy file type: ${source}`)
  await ops.copyFile(source, destination)
  await ops.chmod(destination, PRIVATE_FILE_MODE)
  await syncPath(ops, destination)
  await syncParent(ops, destination)
}

async function verifyCopy(ops, source, destination, { excludePublicDb = false } = {}) {
  const sourceEntries = (await ops.readdir(source)).filter((entry) => !excludePublicDb || entry !== 'public.db').sort()
  const destinationEntries = (await ops.readdir(destination)).filter((entry) => !excludePublicDb || entry !== 'public.db').sort()
  if (JSON.stringify(sourceEntries) !== JSON.stringify(destinationEntries)) throw new Error(`Migration verification failed: ${source}`)
  for (const entry of sourceEntries) {
    const fromPath = path.join(source, entry)
    const toPath = path.join(destination, entry)
    const [from, to] = await Promise.all([ops.lstat(fromPath), ops.lstat(toPath)])
    if (from.isSymbolicLink()) throw symlinkError(fromPath)
    if (from.isDirectory() !== to.isDirectory() || from.isFile() !== to.isFile()) throw new Error(`Migration verification failed: ${fromPath}`)
    if (from.isDirectory()) await verifyCopy(ops, fromPath, toPath)
    if (from.isFile() && await fileDigest(ops, fromPath) !== await fileDigest(ops, toPath)) throw new Error(`Migration verification failed: ${fromPath}`)
  }
}

async function fileDigest(ops, target) {
  return createHash('sha256').update(await ops.readFile(target)).digest('hex')
}

async function validateSymlink(ops, linkPath, expectedPath) {
  const destination = await ops.readlink(linkPath)
  if (path.resolve(path.dirname(linkPath), destination) !== expectedPath) throw new Error(`${linkPath} points outside expected data directory`)
}

async function writeMarker(ops, paths) {
  const temporary = `${paths.layoutVersionFile}.${randomUUID()}.tmp`
  await ops.writeFile(temporary, LAYOUT_VERSION, { mode: PRIVATE_FILE_MODE })
  await syncPath(ops, temporary)
  await syncPath(ops, paths.dataDir)
  await durableRename(ops, temporary, paths.layoutVersionFile)
  await ops.chmod(paths.layoutVersionFile, PRIVATE_FILE_MODE)
  await syncPath(ops, paths.layoutVersionFile)
  await syncPath(ops, paths.dataDir)
}

function migrationError(original, rollbackErrors) {
  if (!rollbackErrors.length) return original
  return new AggregateError([original, ...rollbackErrors], `Migration failed: ${original.message}; rollback also failed: ${rollbackErrors.map((error) => error.message).join('; ')}`)
}

export async function migrateLegacyLayout(paths, { fsOps = fs } = {}) {
  const ops = fsOps
  await privateDirectory(ops, paths.rootDir)
  const legacyConfig = path.join(paths.rootDir, 'config')
  const legacyStorage = path.join(paths.rootDir, 'storage')
  const backupConfig = `${legacyConfig}.migration-backup`
  const backupStorage = `${legacyStorage}.migration-backup`
  let configInfo = await lstatOrNull(ops, legacyConfig)
  let storageInfo = await lstatOrNull(ops, legacyStorage)

  if (configInfo?.isSymbolicLink()) await validateSymlink(ops, legacyConfig, paths.configDir)
  if (storageInfo?.isSymbolicLink()) await validateSymlink(ops, legacyStorage, paths.storageDir)
  if (configInfo?.isSymbolicLink() && storageInfo?.isSymbolicLink()) {
    const publicDb = path.join(paths.storageDir, 'public.db')
    const dbInfo = await lstatOrNull(ops, publicDb)
    if (dbInfo?.isSymbolicLink()) await validateSymlink(ops, publicDb, paths.databaseFile)
    else if (dbInfo) throw new Error('Migrated public.db must be a compatibility symlink')
    await validateMigratedTree(ops, paths.configDir)
    await validateMigratedTree(ops, paths.storageDir, new Map([[publicDb, paths.databaseFile]]))
    await privateDirectory(ops, paths.dataDir)
    if (!await lstatOrNull(ops, paths.layoutVersionFile)) await writeMarker(ops, paths)
    await durableRemove(ops, backupConfig, { recursive: true, force: true })
    await durableRemove(ops, backupStorage, { recursive: true, force: true })
    for (const entry of await ops.readdir(paths.dataDir)) if (entry.startsWith('.migration-')) await durableRemove(ops, path.join(paths.dataDir, entry), { recursive: true, force: true })
    return
  }
  if ((configInfo?.isSymbolicLink() || storageInfo?.isSymbolicLink()) &&
      !await lstatOrNull(ops, backupConfig) && !await lstatOrNull(ops, backupStorage)) {
    throw new Error('Legacy layout is only partially migrated')
  }

  await privateDirectory(ops, paths.dataDir)
  const stagingPaths = (await ops.readdir(paths.dataDir)).filter((entry) => entry.startsWith('.migration-')).map((entry) => path.join(paths.dataDir, entry))
  const configBackupInfo = await lstatOrNull(ops, backupConfig)
  const storageBackupInfo = await lstatOrNull(ops, backupStorage)
  if (configBackupInfo || storageBackupInfo || stagingPaths.length) {
    const installedConfig = await lstatOrNull(ops, paths.configDir)
    const installedStorage = await lstatOrNull(ops, paths.storageDir)
    const canCertify = configBackupInfo?.isDirectory() && storageBackupInfo?.isDirectory() && installedConfig?.isDirectory() && installedStorage?.isDirectory()
    let certificationFailure
    if (canCertify) {
      try {
        await validateLegacyTree(ops, backupConfig)
        await validateLegacyTree(ops, backupStorage)
        await verifyCopy(ops, backupConfig, paths.configDir)
        await verifyCopy(ops, backupStorage, paths.storageDir, { excludePublicDb: true })
        const sourceDatabase = path.join(backupStorage, 'public.db')
        if (await lstatOrNull(ops, sourceDatabase)) {
          if (!await lstatOrNull(ops, paths.databaseFile) || await fileDigest(ops, sourceDatabase) !== await fileDigest(ops, paths.databaseFile)) throw new Error('Migration verification failed: public.db')
          const publicDb = path.join(paths.storageDir, 'public.db')
          const publicDbInfo = await lstatOrNull(ops, publicDb)
          if (publicDbInfo?.isSymbolicLink()) await validateSymlink(ops, publicDb, paths.databaseFile)
          else if (publicDbInfo) throw new Error('Migrated public.db must be a compatibility symlink')
          else await durableSymlink(ops, '../database.sqlite', publicDb)
        }
        for (const [linkPath, destination, expected] of [[legacyConfig, 'data/config', paths.configDir], [legacyStorage, 'data/storage', paths.storageDir]]) {
          const info = await lstatOrNull(ops, linkPath)
          if (info?.isSymbolicLink()) await validateSymlink(ops, linkPath, expected)
          else if (info) throw new Error(`Cannot recover migration while legacy path exists: ${linkPath}`)
          else await durableSymlink(ops, destination, linkPath)
        }
        await syncPath(ops, paths.storageDir)
        await syncPath(ops, paths.dataDir)
        await syncPath(ops, paths.rootDir)
        await writeMarker(ops, paths)
        await durableRemove(ops, backupConfig, { recursive: true, force: true })
        await durableRemove(ops, backupStorage, { recursive: true, force: true })
        for (const staged of stagingPaths) await durableRemove(ops, staged, { recursive: true, force: true })
        return
      } catch (error) {
        certificationFailure = error
      }
    }

    const restoreBackup = async (backup, original, installed) => {
      if (!await lstatOrNull(ops, backup)) return
      const originalInfo = await lstatOrNull(ops, original)
      if (originalInfo?.isSymbolicLink()) await durableRemove(ops, original, { force: true })
      else if (originalInfo) throw new Error(`Cannot roll back migration over existing path: ${original}`)
      await durableRemove(ops, installed, { recursive: true, force: true })
      await durableRename(ops, backup, original)
    }
    try {
      await restoreBackup(backupConfig, legacyConfig, paths.configDir)
      await restoreBackup(backupStorage, legacyStorage, paths.storageDir)
      if (configBackupInfo || storageBackupInfo) await durableRemove(ops, paths.databaseFile, { force: true })
      for (const staged of stagingPaths) await durableRemove(ops, staged, { recursive: true, force: true })
    } catch (rollbackError) {
      if (certificationFailure) throw migrationError(certificationFailure, [rollbackError])
      throw rollbackError
    }
    configInfo = await lstatOrNull(ops, legacyConfig)
    storageInfo = await lstatOrNull(ops, legacyStorage)
  }

  if (!configInfo && !storageInfo) {
    await privateDirectory(ops, paths.configDir)
    await privateDirectory(ops, paths.storageDir)
    await syncPath(ops, paths.dataDir)
    await writeMarker(ops, paths)
    return
  }
  if (!configInfo?.isDirectory() || !storageInfo?.isDirectory()) throw new Error('Legacy config and storage must both be directories')
  await validateLegacyTree(ops, legacyConfig)
  await validateLegacyTree(ops, legacyStorage)

  const transaction = path.join(paths.dataDir, `.migration-${randomUUID()}`)
  const stagedConfig = path.join(transaction, 'config')
  const stagedStorage = path.join(transaction, 'storage')
  const stagedDatabase = path.join(transaction, 'database.sqlite')
  const state = { databaseInstalled: false, committed: false }
  let failure
  try {
    await privateDirectory(ops, transaction)
    await copyPrivateTree(ops, legacyConfig, stagedConfig)
    await privateDirectory(ops, stagedStorage)
    for (const entry of await ops.readdir(legacyStorage)) if (entry !== 'public.db') await copyPrivateTree(ops, path.join(legacyStorage, entry), path.join(stagedStorage, entry))
    const legacyDatabase = path.join(legacyStorage, 'public.db')
    if (await lstatOrNull(ops, legacyDatabase)) await copyPrivateTree(ops, legacyDatabase, stagedDatabase)
    await syncPath(ops, transaction)
    await verifyCopy(ops, legacyConfig, stagedConfig)
    await verifyCopy(ops, legacyStorage, stagedStorage, { excludePublicDb: true })
    if (await lstatOrNull(ops, legacyDatabase)) {
      const copiedDatabase = await ops.lstat(stagedDatabase)
      if (!copiedDatabase.isFile() || await fileDigest(ops, legacyDatabase) !== await fileDigest(ops, stagedDatabase)) throw new Error('Migration verification failed: public.db')
    }

    if (await lstatOrNull(ops, backupConfig) || await lstatOrNull(ops, backupStorage)) throw new Error('Stale migration backup exists')
    if (await lstatOrNull(ops, paths.configDir) || await lstatOrNull(ops, paths.storageDir) || await lstatOrNull(ops, paths.databaseFile)) throw new Error('Decoupled data destination already exists')
    await durableRename(ops, legacyConfig, backupConfig)
    await durableRename(ops, legacyStorage, backupStorage)
    await durableRename(ops, stagedConfig, paths.configDir)
    await durableRename(ops, stagedStorage, paths.storageDir)
    if (await lstatOrNull(ops, stagedDatabase)) { await durableRename(ops, stagedDatabase, paths.databaseFile); state.databaseInstalled = true }
    if (state.databaseInstalled) await durableSymlink(ops, '../database.sqlite', path.join(paths.storageDir, 'public.db'))
    await durableSymlink(ops, 'data/config', legacyConfig)
    await durableSymlink(ops, 'data/storage', legacyStorage)
    await syncPath(ops, paths.storageDir)
    await syncPath(ops, paths.dataDir)
    await syncPath(ops, paths.rootDir)
    await writeMarker(ops, paths)
    state.committed = true
    await durableRemove(ops, backupConfig, { recursive: true, force: true })
    await durableRemove(ops, backupStorage, { recursive: true, force: true })
  } catch (error) {
    failure = error
    if (!state.committed) {
      const rollbackErrors = []
      const attempt = async (operation) => { try { await operation() } catch (rollbackError) { rollbackErrors.push(rollbackError) } }
      const removeLink = async (linkPath) => {
        const info = await lstatOrNull(ops, linkPath)
        if (info?.isSymbolicLink()) await durableRemove(ops, linkPath, { force: true })
      }
      const restore = async (backup, original, installed) => {
        if (!await lstatOrNull(ops, backup)) return
        await removeLink(original)
        await durableRemove(ops, installed, { recursive: true, force: true })
        await durableRename(ops, backup, original)
      }
      await attempt(() => durableRemove(ops, paths.layoutVersionFile, { force: true }))
      await attempt(async () => {
        if (state.databaseInstalled || await lstatOrNull(ops, paths.databaseFile)) await durableRemove(ops, paths.databaseFile, { force: true })
      })
      await attempt(() => restore(backupConfig, legacyConfig, paths.configDir))
      await attempt(() => restore(backupStorage, legacyStorage, paths.storageDir))
      failure = migrationError(error, rollbackErrors)
    }
  } finally {
    try { await durableRemove(ops, transaction, { recursive: true, force: true }) } catch (cleanupError) { failure = migrationError(failure ?? cleanupError, failure ? [cleanupError] : []) }
  }
  if (failure) throw failure
}
