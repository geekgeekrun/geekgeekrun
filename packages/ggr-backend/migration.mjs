import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

function argument(name, offset = 1) {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + offset] ?? null
}

const source = argument('--backup')
const destination = source ? argument('--backup', 2) : null
const rehearsalDatabase = argument('--rehearse')
const schemaVersion = rehearsalDatabase ? argument('--rehearse', 2) : null

if (source || destination) {
  if (!source || !destination || rehearsalDatabase) throw new Error('migration runner requires --backup <source> <destination>')
  const database = new Database(source, { readonly: true, fileMustExist: true })
  try { await database.backup(destination) } finally { database.close() }
} else {
  if (!rehearsalDatabase || !/^\d+$/.test(schemaVersion ?? '')) throw new Error('migration runner requires --rehearse <database> <schemaVersion>')
  // This artifact currently has schema version 0 and no destructive changes.
  // Future candidate migrations belong here and must operate only on this
  // supervisor-created SQLite backup, never on the production database.
  const database = new Database(rehearsalDatabase, { fileMustExist: true })
  try { database.pragma(`user_version = ${Number(schemaVersion)}`) } finally { database.close() }
}
