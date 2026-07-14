import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn as nodeSpawn } from 'node:child_process'
const fail = (code, message) => Object.assign(new Error(message), { code })
function run(command, args) { return new Promise((resolve, reject) => { const child = nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = ''; const timer = setTimeout(() => { child.kill?.('SIGKILL'); reject(fail('MIGRATION_REHEARSAL_TIMEOUT', 'Candidate migration rehearsal timed out')) }, 60_000); child.stderr?.setEncoding?.('utf8'); child.stderr?.on?.('data', (x) => { stderr += x }); child.once('error', (e) => { clearTimeout(timer); reject(fail('MIGRATION_REHEARSAL_FAILED', e.message)) }); child.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(fail('MIGRATION_REHEARSAL_FAILED', stderr.slice(0, 512) || 'Candidate migration rehearsal failed')) }) }) }
export function createMigrationService({ runtimeDir } = {}) {
  if (!path.isAbsolute(runtimeDir ?? '')) throw new TypeError('runtimeDir is required')
  const source = path.join(runtimeDir, 'data', 'database.sqlite')
  return Object.freeze({ async rehearse({ version, database, versionsDir }) {
    if (!database || database.rollbackCompatible !== true || !Number.isInteger(database.schemaVersion)) throw fail('MIGRATION_INCOMPATIBLE', 'Signed artifact database compatibility metadata is invalid')
    const live = await fs.lstat(source).catch((e) => e.code === 'ENOENT' ? null : Promise.reject(e)); if (!live) return { state: 'no_live_database' }; if (!live.isFile() || live.isSymbolicLink()) throw fail('MIGRATION_REHEARSAL_FAILED', 'Live database is not a regular file')
    const candidate = path.join(versionsDir, version), node = path.join(candidate, 'bin', 'node'), entry = path.join(candidate, 'app', 'migration.mjs'), root = path.join(runtimeDir, '.migration-rehearsals'), backups = path.join(runtimeDir, 'backups', 'database'); await fs.mkdir(root, { recursive: true, mode: 0o700 }); await fs.mkdir(backups, { recursive: true, mode: 0o700 }); const dir = await fs.mkdtemp(path.join(root, '.candidate-')), backup = path.join(backups, `${version}-${Date.now()}-${randomUUID()}.sqlite`); try { await run(node, [entry, '--backup', source, backup]); await run(node, [entry, '--backup', source, path.join(dir, 'database.sqlite'), '--rehearse', String(database.schemaVersion)]); return { state: 'validated', backup } } finally { await fs.rm(dir, { recursive: true, force: true }) }
  } })
}
