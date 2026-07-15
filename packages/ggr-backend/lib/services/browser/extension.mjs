import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import extractZip from 'extract-zip'

const EXTENSION_VERSION = 1
const extensionArchive = new URL('../../../../launch-bosszhipin-login-page-with-preload-extension/extensions/EditThisCookie.zip', import.meta.url)

export async function ensureEditThisCookieExtension({ runtimePaths, fsOps = fs, unzip = extractZip } = {}) {
  if (!runtimePaths?.rootDir) throw new TypeError('runtimePaths.rootDir is required')
  const extensionDir = path.join(runtimePaths.rootDir, 'chrome-extensions', 'EditThisCookie')
  const versionFile = path.join(extensionDir, 'GEEKGEEKRUN_EDIT_VERSION')
  const doneFile = path.join(extensionDir, 'EXTRACT_DONE')
  const version = await fsOps.readFile(versionFile, 'utf8').then(Number, () => 0)
  const ready = version >= EXTENSION_VERSION && await fsOps.access(doneFile).then(() => true, () => false)
  if (!ready) {
    await fsOps.rm(extensionDir, { recursive: true, force: true })
    await fsOps.mkdir(path.dirname(extensionDir), { recursive: true, mode: 0o700 })
    await unzip(fileURLToPath(extensionArchive), { dir: path.dirname(extensionDir) })
    await fsOps.writeFile(doneFile, '', { mode: 0o600 })
  }
  return extensionDir
}
