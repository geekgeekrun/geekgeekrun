import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

function argument(name, offset = 1) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + offset] ?? null
}

const source = argument('--backup')
const destination = source ? argument('--backup', 2) : null
// This artifact currently has schema version 0 and no destructive migrations.
// Keeping the runner explicit makes every future schema change rehearse against
// a SQLite online backup before it can be activated.
if (!source || !destination) throw new Error('migration runner requires --backup <source> <destination>')
const database = new Database(source, { readonly: true, fileMustExist: true })
try { await database.backup(destination) } finally { database.close() }
