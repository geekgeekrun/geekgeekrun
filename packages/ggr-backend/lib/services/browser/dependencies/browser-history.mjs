import fs from 'node:fs/promises'
import path from 'node:path'

const CONFIG_VERSION = 2

export function createBrowserHistory({ storageDir, fsOps = fs }) {
  if (!path.isAbsolute(storageDir)) throw new TypeError('storageDir must be absolute')
  const recordFile = path.join(storageDir, 'last-used-browser-record')

  async function remove() { await fsOps.rm(recordFile, { force: true }) }
  async function read() {
    try {
      const [executablePath, browser, version] = (await fsOps.readFile(recordFile, 'utf8')).split('\n').map((value) => value.trim())
      if (!executablePath || Number(version) < CONFIG_VERSION || !await fsOps.stat(executablePath).then((value) => value.isFile(), () => false)) {
        await remove()
        return null
      }
      return { executablePath, browser }
    } catch (error) {
      if (error.code !== 'ENOENT') await remove()
      return null
    }
  }
  async function write({ executablePath, browser }) {
    if (!path.isAbsolute(executablePath) || typeof browser !== 'string' || !browser) throw Object.assign(new Error('Invalid browser information'), { code: 'INVALID_PARAMS' })
    await fsOps.mkdir(storageDir, { recursive: true, mode: 0o700 })
    await fsOps.chmod(storageDir, 0o700)
    await fsOps.writeFile(recordFile, [executablePath, browser, CONFIG_VERSION].join('\n'), { mode: 0o600 })
    await fsOps.chmod(recordFile, 0o600)
  }
  return { read, write, remove, recordFile }
}
