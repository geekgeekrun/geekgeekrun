import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const COOKIE_KEYS = ['name', 'value', 'domain', 'path', 'secure', 'session', 'httpOnly']

export function isValidCookieList(cookies) {
  return Array.isArray(cookies) && cookies.length > 0 && cookies.every((cookie) =>
    cookie && typeof cookie === 'object' && COOKIE_KEYS.every((key) => Object.hasOwn(cookie, key)))
}

export function createBrowserStorage({ storageDir, fsOps = fs, createId = randomUUID } = {}) {
  if (!path.isAbsolute(storageDir)) throw new TypeError('storageDir must be absolute')
  const file = (name) => path.join(storageDir, name)

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

  async function writeSession({ cookies, localStorage }) {
    if (!isValidCookieList(cookies)) throw Object.assign(new Error('Boss cookies are invalid'), { code: 'COOKIE_INVALID' })
    if (!localStorage || typeof localStorage !== 'object' || Array.isArray(localStorage)) throw Object.assign(new Error('Boss local storage is invalid'), { code: 'STORAGE_INVALID' })
    // This is the authoritative session. The legacy files below only keep existing workers
    // working while they are being moved to this backend-owned storage boundary.
    await writeAtomic('boss-session.json', { cookies, localStorage })
    await Promise.all([
      writeAtomic('boss-cookies.json', cookies),
      writeAtomic('boss-local-storage.json', localStorage)
    ])
  }

  async function readSession() {
    const session = await read('boss-session.json', null)
    return session && isValidCookieList(session.cookies) && session.localStorage &&
      typeof session.localStorage === 'object' && !Array.isArray(session.localStorage)
      ? session
      : null
  }

  return {
    readCookies: async () => (await readSession())?.cookies ?? read('boss-cookies.json', []),
    readLocalStorage: async () => (await readSession())?.localStorage ?? read('boss-local-storage.json', {}),
    readReasonCache: () => read('job-not-suit-reason-code-to-text-cache.json', {}),
    writeReasonCache: (value) => writeAtomic('job-not-suit-reason-code-to-text-cache.json', value),
    writeSession
  }
}
