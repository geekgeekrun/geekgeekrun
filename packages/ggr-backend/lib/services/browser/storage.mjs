import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const COOKIE_KEYS = ['name', 'value', 'domain', 'path', 'secure', 'session', 'httpOnly']
const MISSING = Symbol('missing session file')

export function isValidCookieList(cookies) {
  return Array.isArray(cookies) && cookies.length > 0 && cookies.every((cookie) =>
    cookie && typeof cookie === 'object' && COOKIE_KEYS.every((key) => Object.hasOwn(cookie, key)))
}

export function createBrowserStorage({ storageDir, fsOps = fs, createId = randomUUID } = {}) {
  if (!path.isAbsolute(storageDir)) throw new TypeError('storageDir must be absolute')
  const file = (name) => path.join(storageDir, name)
  let mutations = Promise.resolve()
  let legacyMigration

  async function read(name, fallback) {
    try { return JSON.parse(await fsOps.readFile(file(name), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
  }

  async function writeAtomic(name, value) {
    await fsOps.mkdir(storageDir, { recursive: true, mode: 0o700 })
    await fsOps.chmod(storageDir, 0o700)
    const destination = file(name)
    const temporary = `${destination}.${createId()}.tmp`
    try {
      await fsOps.writeFile(temporary, JSON.stringify(value), { mode: 0o600 })
      await fsOps.rename(temporary, destination)
      await fsOps.chmod(destination, 0o600)
    } catch (error) {
      await fsOps.rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }

  const isValidLocalStorage = (localStorage) => localStorage && typeof localStorage === 'object' && !Array.isArray(localStorage)

  const mutate = (action) => {
    const pending = mutations.then(action, action)
    mutations = pending.catch(() => {})
    return pending
  }

  async function persistSession({ cookies, localStorage }) {
    if (!isValidCookieList(cookies)) throw Object.assign(new Error('Boss cookies are invalid'), { code: 'COOKIE_INVALID' })
    if (!isValidLocalStorage(localStorage)) throw Object.assign(new Error('Boss local storage is invalid'), { code: 'STORAGE_INVALID' })
    // This is the authoritative session. The legacy files below only keep existing workers
    // working while they are being moved to this backend-owned storage boundary.
    await writeAtomic('boss-session.json', { cookies, localStorage })
    await Promise.all([
      writeAtomic('boss-cookies.json', cookies),
      writeAtomic('boss-local-storage.json', localStorage)
    ])
  }

  async function writeSession(session) {
    return mutate(() => persistSession(session))
  }

  async function readStoredSession() {
    try { return JSON.parse(await fsOps.readFile(file('boss-session.json'), 'utf8')) }
    catch (error) { return error.code === 'ENOENT' ? MISSING : null }
  }

  async function migrateLegacySession() {
    const existing = await readStoredSession()
    if (existing !== MISSING) return isValidCookieList(existing?.cookies) && isValidLocalStorage(existing?.localStorage) ? existing : null
    let cookies
    let localStorage
    try {
      [cookies, localStorage] = await Promise.all([
        read('boss-cookies.json', []),
        read('boss-local-storage.json', {})
      ])
    } catch {
      return null
    }
    if (!isValidCookieList(cookies)) return null
    const pairedLocalStorage = isValidLocalStorage(localStorage) ? localStorage : {}
    await persistSession({ cookies, localStorage: pairedLocalStorage })
    return { cookies, localStorage: pairedLocalStorage }
  }

  async function readSession() {
    const session = await readStoredSession()
    if (session !== MISSING) return isValidCookieList(session?.cookies) && isValidLocalStorage(session?.localStorage) ? session : null
    // A missing authoritative file is the only migration case. An invalidated
    // session is deliberately stored as null, so stale legacy mirrors cannot revive it.
    if (!legacyMigration) legacyMigration = mutate(migrateLegacySession)
    return legacyMigration
  }

  async function invalidateSession() {
    return mutate(async () => {
      // Invalidate the authority first. If a compatibility-mirror write fails,
      // no backend consumer can restore the stale login state.
      await writeAtomic('boss-session.json', null)
      await Promise.all([
        writeAtomic('boss-cookies.json', []),
        writeAtomic('boss-local-storage.json', {})
      ])
    })
  }

  return {
    readSession,
    readCookies: async () => (await readSession())?.cookies ?? [],
    readLocalStorage: async () => (await readSession())?.localStorage ?? {},
    readReasonCache: () => read('job-not-suit-reason-code-to-text-cache.json', {}),
    writeReasonCache: (value) => writeAtomic('job-not-suit-reason-code-to-text-cache.json', value),
    writeSession,
    invalidateSession
  }
}
