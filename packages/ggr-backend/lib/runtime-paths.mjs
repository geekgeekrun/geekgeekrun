import fs from 'node:fs/promises'
import path from 'node:path'

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
    rootDir,
    runtimeDir,
    runDir,
    dataDir,
    logsDir,
    configDir: path.join(dataDir, 'config'),
    storageDir: path.join(dataDir, 'storage'),
    databaseFile: path.join(dataDir, 'database.sqlite'),
    layoutVersionFile: path.join(dataDir, '.layout-version'),
    backendSocket: path.join(runDir, 'backend.sock'),
    backendLog: path.join(logsDir, 'backend.jsonl')
  })
}

async function forcePrivateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: PRIVATE_DIR_MODE })
  await fs.chmod(directory, PRIVATE_DIR_MODE)
}

async function syncTree(target) {
  const info = await fs.lstat(target)
  if (info.isDirectory()) {
    for (const entry of await fs.readdir(target)) await syncTree(path.join(target, entry))
  } else if (info.isFile()) {
    const handle = await fs.open(target, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
}

async function makeTreePrivate(target) {
  const info = await fs.lstat(target)
  if (info.isDirectory()) {
    await fs.chmod(target, PRIVATE_DIR_MODE)
    for (const entry of await fs.readdir(target)) await makeTreePrivate(path.join(target, entry))
  } else if (info.isFile()) {
    await fs.chmod(target, PRIVATE_FILE_MODE)
  }
}

async function verifyCopy(source, destination, { excludePublicDb = false } = {}) {
  const sourceEntries = (await fs.readdir(source)).filter((entry) => !excludePublicDb || entry !== 'public.db').sort()
  const destinationEntries = (await fs.readdir(destination)).sort()
  if (JSON.stringify(sourceEntries) !== JSON.stringify(destinationEntries)) throw new Error(`Migration verification failed: ${source}`)
  for (const entry of sourceEntries) {
    const sourcePath = path.join(source, entry)
    const destinationPath = path.join(destination, entry)
    const [from, to] = await Promise.all([fs.lstat(sourcePath), fs.lstat(destinationPath)])
    if (from.isDirectory() !== to.isDirectory() || from.isFile() !== to.isFile() || (from.isFile() && from.size !== to.size)) {
      throw new Error(`Migration verification failed: ${sourcePath}`)
    }
    if (from.isDirectory()) await verifyCopy(sourcePath, destinationPath)
  }
}

async function validateSymlink(linkPath, expectedPath) {
  const destination = await fs.readlink(linkPath)
  const resolved = path.resolve(path.dirname(linkPath), destination)
  if (resolved !== expectedPath) throw new Error(`${linkPath} points outside expected data directory`)
}

async function writeMarker(paths) {
  const temporary = `${paths.layoutVersionFile}.${process.pid}.tmp`
  await fs.writeFile(temporary, LAYOUT_VERSION, { mode: PRIVATE_FILE_MODE })
  const handle = await fs.open(temporary, 'r')
  try { await handle.sync() } finally { await handle.close() }
  await fs.rename(temporary, paths.layoutVersionFile)
  await fs.chmod(paths.layoutVersionFile, PRIVATE_FILE_MODE)
}

export async function migrateLegacyLayout(paths) {
  await forcePrivateDirectory(paths.rootDir)
  const legacyConfig = path.join(paths.rootDir, 'config')
  const legacyStorage = path.join(paths.rootDir, 'storage')
  const configInfo = await fs.lstat(legacyConfig).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
  const storageInfo = await fs.lstat(legacyStorage).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))

  if (configInfo?.isSymbolicLink()) await validateSymlink(legacyConfig, paths.configDir)
  if (storageInfo?.isSymbolicLink()) await validateSymlink(legacyStorage, paths.storageDir)
  if (configInfo?.isSymbolicLink() || storageInfo?.isSymbolicLink()) {
    if (!configInfo?.isSymbolicLink() || !storageInfo?.isSymbolicLink()) throw new Error('Legacy layout is only partially migrated')
    const publicDb = path.join(paths.storageDir, 'public.db')
    const publicDbInfo = await fs.lstat(publicDb).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (publicDbInfo?.isSymbolicLink()) await validateSymlink(publicDb, paths.databaseFile)
    await forcePrivateDirectory(paths.dataDir)
    if (!(await fs.stat(paths.layoutVersionFile).catch(() => null))) await writeMarker(paths)
    return
  }

  await forcePrivateDirectory(paths.dataDir)
  if (!configInfo && !storageInfo) {
    await forcePrivateDirectory(paths.configDir)
    await forcePrivateDirectory(paths.storageDir)
    await writeMarker(paths)
    return
  }
  if (!configInfo?.isDirectory() || !storageInfo?.isDirectory()) throw new Error('Legacy config and storage must both be directories')

  const transaction = path.join(paths.dataDir, `.migration-${process.pid}-${Date.now()}`)
  const stagedConfig = path.join(transaction, 'config')
  const stagedStorage = path.join(transaction, 'storage')
  const stagedDatabase = path.join(transaction, 'database.sqlite')
  const backupConfig = `${legacyConfig}.migration-backup`
  const backupStorage = `${legacyStorage}.migration-backup`
  let legacyMoved = false
  try {
    await forcePrivateDirectory(transaction)
    await fs.cp(legacyConfig, stagedConfig, { recursive: true, preserveTimestamps: true })
    await forcePrivateDirectory(stagedConfig)
    await forcePrivateDirectory(stagedStorage)
    for (const entry of await fs.readdir(legacyStorage)) {
      if (entry !== 'public.db') await fs.cp(path.join(legacyStorage, entry), path.join(stagedStorage, entry), { recursive: true, preserveTimestamps: true })
    }
    const legacyDatabase = path.join(legacyStorage, 'public.db')
    if (await fs.stat(legacyDatabase).catch(() => null)) await fs.copyFile(legacyDatabase, stagedDatabase)
    await makeTreePrivate(transaction)
    await syncTree(transaction)
    await verifyCopy(legacyConfig, stagedConfig)
    await verifyCopy(legacyStorage, stagedStorage, { excludePublicDb: true })
    if (await fs.stat(legacyDatabase).catch(() => null)) {
      const [from, to] = await Promise.all([fs.stat(legacyDatabase), fs.stat(stagedDatabase)])
      if (from.size !== to.size) throw new Error('Migration verification failed: public.db')
    }

    await fs.rm(backupConfig, { recursive: true, force: true })
    await fs.rm(backupStorage, { recursive: true, force: true })
    await fs.rename(legacyConfig, backupConfig)
    await fs.rename(legacyStorage, backupStorage)
    legacyMoved = true
    await fs.rm(paths.configDir, { recursive: true, force: true })
    await fs.rm(paths.storageDir, { recursive: true, force: true })
    await fs.rename(stagedConfig, paths.configDir)
    await fs.rename(stagedStorage, paths.storageDir)
    if (await fs.stat(stagedDatabase).catch(() => null)) await fs.rename(stagedDatabase, paths.databaseFile)
    if (await fs.stat(paths.databaseFile).catch(() => null)) await fs.symlink('../database.sqlite', path.join(paths.storageDir, 'public.db'))
    await fs.symlink('data/config', legacyConfig)
    await fs.symlink('data/storage', legacyStorage)
    await writeMarker(paths)
    await fs.rm(backupConfig, { recursive: true, force: true })
    await fs.rm(backupStorage, { recursive: true, force: true })
  } catch (error) {
    await fs.rm(paths.layoutVersionFile, { force: true }).catch(() => {})
    if (legacyMoved) {
      await fs.rm(legacyConfig, { recursive: true, force: true }).catch(() => {})
      await fs.rm(legacyStorage, { recursive: true, force: true }).catch(() => {})
      await fs.rm(paths.configDir, { recursive: true, force: true }).catch(() => {})
      await fs.rm(paths.storageDir, { recursive: true, force: true }).catch(() => {})
      await fs.rm(paths.databaseFile, { force: true }).catch(() => {})
      await fs.rename(backupConfig, legacyConfig).catch(() => {})
      await fs.rename(backupStorage, legacyStorage).catch(() => {})
    }
    throw error
  } finally {
    await fs.rm(transaction, { recursive: true, force: true }).catch(() => {})
  }
}
