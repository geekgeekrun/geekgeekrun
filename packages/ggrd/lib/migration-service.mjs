import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn as nodeSpawn } from 'node:child_process'

const PRIVATE_DIR_MODE = 0o700

function failure(code, message) { return Object.assign(new Error(message), { code }) }

function run(command, args, { spawnProcess = nodeSpawn, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let timer = setTimeout(() => { child.kill?.('SIGKILL'); reject(failure('MIGRATION_REHEARSAL_TIMEOUT', 'Candidate migration rehearsal timed out')) }, timeoutMs)
    child.stderr?.setEncoding?.('utf8'); child.stderr?.on?.('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => { clearTimeout(timer); reject(failure('MIGRATION_REHEARSAL_FAILED', error.message)) })
    child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(failure('MIGRATION_REHEARSAL_FAILED', `Candidate migration rehearsal failed${stderr ? `: ${stderr.slice(0, 512)}` : ''}`)) })
  })
}

/** Runs the candidate's migration entrypoint on a SQLite backup, never live data. */
export function createMigrationService({ runtimeDir, spawnProcess = nodeSpawn, timeoutMs } = {}) {
  if (!path.isAbsolute(runtimeDir ?? '')) throw new TypeError('runtimeDir is required')
  const liveDatabase = path.join(runtimeDir, 'data', 'database.sqlite')
  const stagingRoot = path.join(runtimeDir, '.migration-rehearsals')
  const backupRoot = path.join(runtimeDir, 'backups', 'database')

  async function rehearse({ version, database, versionsDir }) {
    if (!database || !Number.isInteger(database.schemaVersion) || database.schemaVersion < 0 || database.rollbackCompatible !== true) {
      throw failure('MIGRATION_INCOMPATIBLE', 'Signed artifact database compatibility metadata is invalid')
    }
    const source = await fs.lstat(liveDatabase).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!source) return { state: 'no_live_database', schemaVersion: database.schemaVersion }
    if (!source.isFile() || source.isSymbolicLink()) throw failure('MIGRATION_REHEARSAL_FAILED', 'Live database is not a regular file')
    const candidateRoot = path.join(versionsDir, version)
    const node = path.join(candidateRoot, 'bin', 'node')
    const entry = path.join(candidateRoot, 'app', 'migration.mjs')
    for (const target of [node, entry]) {
      const info = await fs.lstat(target).catch(() => null)
      if (!info?.isFile() || info.isSymbolicLink()) throw failure('MIGRATION_REHEARSAL_FAILED', 'Candidate has no safe migration entrypoint')
    }
    await fs.mkdir(stagingRoot, { recursive: true, mode: PRIVATE_DIR_MODE }); await fs.chmod(stagingRoot, PRIVATE_DIR_MODE)
    await fs.mkdir(backupRoot, { recursive: true, mode: PRIVATE_DIR_MODE }); await fs.chmod(backupRoot, PRIVATE_DIR_MODE)
    const directory = await fs.mkdtemp(path.join(stagingRoot, '.candidate-')); await fs.chmod(directory, PRIVATE_DIR_MODE)
    const rehearsal = path.join(directory, 'database.sqlite')
    const backup = path.join(backupRoot, `${version}-${Date.now()}-${randomUUID()}.sqlite`)
    try {
      // The candidate process uses SQLite's online backup API. Its only write
      // targets are the rehearsal copy and durable rollback backup.
      await run(node, [entry, '--backup', liveDatabase, backup], { spawnProcess, timeoutMs })
      await run(node, [entry, '--backup', liveDatabase, rehearsal, '--rehearse', String(database.schemaVersion)], { spawnProcess, timeoutMs })
      return { state: 'validated', schemaVersion: database.schemaVersion, backup }
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
  return Object.freeze({ rehearse })
}
