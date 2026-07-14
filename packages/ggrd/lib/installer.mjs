import fs from 'node:fs/promises'
import fsNative from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'

export const ARTIFACT_FRAMING_ALLOWANCE = 64 * 1024

export class InstallerError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'InstallerError'
    this.code = code
  }
}

function fail(code, message) { throw new InstallerError(code, message) }

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new InstallerError('INSTALL_DEADLINE_EXCEEDED', 'Backend installation was cancelled')
}

function httpsUrl(value, label = 'URL') {
  let url
  try { url = new URL(value) } catch { fail('URL_INVALID', `${label} is invalid`) }
  if (url.protocol !== 'https:') fail('URL_INSECURE', `${label} must use HTTPS`)
  return url
}

function installArtifactMetadata(manifest) {
  if (!manifest || typeof manifest !== 'object' || typeof manifest.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(manifest.version)) {
    fail('MANIFEST_INVALID', 'Manifest version is invalid')
  }
  const artifact = manifest.artifact ?? (Array.isArray(manifest.artifacts) && manifest.artifacts.length === 1 ? manifest.artifacts[0] : null)
  if (!artifact || typeof artifact !== 'object') fail('MANIFEST_INVALID', 'Manifest must contain one selected artifact')
  httpsUrl(artifact.url, 'Artifact URL')
  if (typeof artifact.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(artifact.sha256)) fail('DIGEST_INVALID', 'Artifact digest is invalid')
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) fail('MANIFEST_INVALID', 'Artifact size is invalid')
  const extractedSize = artifact.extractionSize ?? artifact.maxExtractedSize ?? 0
  if (!Number.isSafeInteger(extractedSize) || extractedSize < 0) fail('MANIFEST_INVALID', 'Artifact extraction size is invalid')
  const database = manifest.database ?? manifest.databaseCompatibility
  if (!database || !Number.isInteger(database.schemaVersion) || database.schemaVersion < 0) fail('MANIFEST_INVALID', 'Database compatibility metadata is required')
  if (database.rollbackCompatible !== true) fail('DATABASE_ROLLBACK_INCOMPATIBLE', 'Database changes are not rollback compatible')
  return { artifact, extractedSize }
}

async function availableDiskBytes(directory) {
  if (typeof fs.statfs !== 'function') fail('DISK_SPACE_UNKNOWN', 'Filesystem free-space checks are unavailable')
  const stats = await fs.statfs(directory)
  const blocks = stats.bavail ?? stats.bfree
  const bytes = Number(blocks) * Number(stats.bsize)
  if (!Number.isSafeInteger(bytes) || bytes < 0) fail('DISK_SPACE_UNKNOWN', 'Filesystem free-space check returned an invalid value')
  return bytes
}

async function writeAll(handle, bytes) {
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset)
    if (!bytesWritten) throw new Error('Unable to write downloaded artifact')
    offset += bytesWritten
  }
}

async function readPartial(part, metadataPath, artifact) {
  const [info, rawMetadata] = await Promise.all([
    fs.lstat(part).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error)),
    fs.readFile(metadataPath, 'utf8').catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
  ])
  if (!info || !rawMetadata) return null
  if (!info.isFile() || info.isSymbolicLink()) fail('PARTIAL_UNSAFE', 'Resumable artifact partial is not a regular file')
  let metadata
  try { metadata = JSON.parse(rawMetadata) } catch { return null }
  const validator = typeof metadata.etag === 'string' ? metadata.etag : typeof metadata.lastModified === 'string' ? metadata.lastModified : null
  if (!validator || metadata.url !== artifact.url || metadata.bytes !== info.size || info.size <= 0 || info.size > artifact.size + ARTIFACT_FRAMING_ALLOWANCE) return null
  return { bytes: info.size, validator }
}

async function writePartialMetadata(target, value) {
  const temporary = `${target}.${randomUUID()}.next`
  const handle = await fs.open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(JSON.stringify(value))
    await handle.sync()
  } finally { await handle.close() }
  await fs.rename(temporary, target)
}

async function removePartial(part, metadataPath) {
  await Promise.all([
    fs.rm(part, { force: true }),
    fs.rm(metadataPath, { force: true })
  ])
}

async function hashPartial(part, hash) {
  const stream = fsNative.createReadStream(part)
  for await (const chunk of stream) hash.update(chunk)
}

function streamFrom(downloaded) {
  if (Buffer.isBuffer(downloaded) || downloaded instanceof Uint8Array) return { stream: Readable.from([downloaded]) }
  if (downloaded?.stream) return downloaded
  if (downloaded && typeof downloaded[Symbol.asyncIterator] === 'function') return { stream: downloaded }
  fail('DOWNLOAD_INVALID', 'Downloader did not return a readable artifact stream')
}

async function fetchDownload({ url, resume }) {
  let target = httpsUrl(url, 'Artifact URL')
  for (let redirects = 0; redirects <= 5; redirects++) {
    const headers = {}
    if (resume?.bytes > 0 && resume.validator) {
      headers.Range = `bytes=${resume.bytes}-`
      headers['If-Range'] = resume.validator
    }
    const response = await fetch(target, { redirect: 'manual', headers })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) fail('DOWNLOAD_FAILED', 'Artifact redirect is missing a location')
      target = httpsUrl(new URL(location, target).href, 'Artifact redirect')
      continue
    }
    if (!response.ok || !response.body) fail('DOWNLOAD_FAILED', `Artifact download failed with HTTP ${response.status}`)
    const etag = response.headers.get('etag')
    const lastModified = response.headers.get('last-modified')
    return {
      stream: Readable.fromWeb(response.body),
      url: target.href,
      etag, lastModified, status: response.status,
      resumeValidated: Boolean(resume && response.status === 206 && (etag === resume.validator || lastModified === resume.validator))
    }
  }
  fail('DOWNLOAD_FAILED', 'Artifact download exceeded redirect limit')
}

function extractionParts(entryPath) {
  if (typeof entryPath !== 'string' || !entryPath) fail('EXTRACTION_PATH_INVALID', 'Archive entry path is invalid')
  const normalized = entryPath.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) fail('EXTRACTION_PATH_INVALID', `Archive entry escapes destination: ${entryPath}`)
  const parts = normalized.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) fail('EXTRACTION_PATH_INVALID', `Archive entry escapes destination: ${entryPath}`)
  return parts
}

async function ensureSafeDirectory(root, parts) {
  const rootInfo = await fs.lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail('EXTRACTION_UNSAFE', 'Staging destination is not a real directory')
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    await fs.mkdir(current, { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await fs.lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) fail('EXTRACTION_UNSAFE', `Archive path traverses a non-directory: ${current}`)
  }
  return current
}

function entryStream(data) {
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) return Readable.from([data])
  if (data && typeof data[Symbol.asyncIterator] === 'function') return data
  if (data && typeof data.getReader === 'function') return Readable.fromWeb(data)
  fail('EXTRACTOR_INVALID', 'File archive entries must provide byte data')
}

async function writeArchiveFile(root, parts, data, limits) {
  const parent = await ensureSafeDirectory(root, parts.slice(0, -1))
  const target = path.join(parent, parts.at(-1))
  if (await fs.lstat(target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))) {
    fail('EXTRACTION_UNSAFE', `Archive contains a duplicate or colliding entry: ${parts.join('/')}`)
  }
  const noFollow = fsNative.constants.O_NOFOLLOW ?? 0
  const flags = fsNative.constants.O_WRONLY | fsNative.constants.O_CREAT | fsNative.constants.O_EXCL | noFollow
  const handle = await fs.open(target, flags, 0o600)
  try {
    for await (const value of entryStream(data)) {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
      limits.total += bytes.length
      if (limits.total > limits.maximum) fail('EXTRACTION_TOO_LARGE', 'Extracted artifact exceeds its declared maximum size')
      await writeAll(handle, bytes)
    }
    await handle.sync()
  } finally { await handle.close() }
}

async function extractSafely({ archive, extract, destination, maximumBytes, signal }) {
  // Extractor adapters are parsers only: they receive no destination path and
  // return entries for this module to validate and write itself.
  throwIfAborted(signal)
  const entries = await extract(Object.freeze({ archive, maxBytes: maximumBytes, signal }))
  throwIfAborted(signal)
  if (!entries || (typeof entries[Symbol.iterator] !== 'function' && typeof entries[Symbol.asyncIterator] !== 'function')) {
    fail('EXTRACTOR_INVALID', 'Extractor must return an iterable of archive entries')
  }
  const limits = { total: 0, maximum: maximumBytes }
  for await (const entry of entries) {
    throwIfAborted(signal)
    if (!entry || typeof entry !== 'object') fail('EXTRACTOR_INVALID', 'Extractor returned an invalid archive entry')
    const parts = extractionParts(entry.path)
    if (entry.type === 'directory') {
      await ensureSafeDirectory(destination, parts)
      continue
    }
    if (entry.type !== 'file') fail('EXTRACTION_UNSAFE', `Archive entry type is not allowed: ${entry.type ?? 'unknown'}`)
    await writeArchiveFile(destination, parts, entry.data, limits)
  }
}

async function validateExtractedTree(target, maximumBytes) {
  let total = 0
  async function visit(current) {
    const info = await fs.lstat(current)
    if (info.isSymbolicLink()) fail('EXTRACTION_UNSAFE', `Archive created a symbolic link: ${current}`)
    if (info.isFile()) {
      total += info.size
      if (total > maximumBytes) fail('EXTRACTION_TOO_LARGE', 'Extracted artifact exceeds its declared maximum size')
      return
    }
    if (!info.isDirectory()) fail('EXTRACTION_UNSAFE', `Archive created an unsupported file type: ${current}`)
    for (const name of await fs.readdir(current)) await visit(path.join(current, name))
  }
  await visit(target)
}

async function regularFile(target) {
  const info = await fs.lstat(target).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
  return Boolean(info?.isFile() && !info.isSymbolicLink())
}

async function downloadToFile({ url, download, destination, artifact, metadataPath, signal }) {
  throwIfAborted(signal)
  let resume = await readPartial(destination, metadataPath, artifact)
  if (!resume) await removePartial(destination, metadataPath)
  let result = streamFrom(await (download ?? fetchDownload)({ url, resume, signal }))
  if (result.url) httpsUrl(result.url, 'Downloaded artifact URL')
  if (resume && result.resumeValidated !== true) {
    // A range response is only trusted after the server validated the stored
    // ETag/Last-Modified validator. Otherwise start from signed byte zero.
    await removePartial(destination, metadataPath)
    resume = null
    result = streamFrom(await (download ?? fetchDownload)({ url, resume, signal }))
    if (result.url) httpsUrl(result.url, 'Downloaded artifact URL')
  }
  const maximumBytes = artifact.size + ARTIFACT_FRAMING_ALLOWANCE
  const hash = createHash('sha256')
  let received = resume?.bytes ?? 0
  if (resume) await hashPartial(destination, hash)
  const validator = typeof result.etag === 'string' ? { etag: result.etag } : typeof result.lastModified === 'string' ? { lastModified: result.lastModified } : null
  if (!validator) await fs.rm(metadataPath, { force: true })
  else await writePartialMetadata(metadataPath, { url, bytes: received, ...validator })
  const file = await fs.open(destination, resume ? 'a' : 'w', 0o600)
  try {
    for await (const value of result.stream) {
      throwIfAborted(signal)
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
      received += bytes.length
      if (received > maximumBytes) fail('ARTIFACT_TOO_LARGE', 'Artifact exceeds its signed size allowance')
      hash.update(bytes)
      await writeAll(file, bytes)
      if (validator) {
        // Do not publish resumable byte counts until the corresponding bytes
        // are durable; otherwise a crash could resume from unwritten data.
        await file.sync()
        await writePartialMetadata(metadataPath, { url, bytes: received, ...validator })
      }
    }
    await file.sync()
  } finally {
    await file.close()
  }
  if (received < artifact.size) {
    await removePartial(destination, metadataPath)
    fail('ARTIFACT_TRUNCATED', 'Artifact is smaller than its signed size')
  }
  const actual = hash.digest()
  const expected = Buffer.from(artifact.sha256, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    await removePartial(destination, metadataPath)
    fail('DIGEST_MISMATCH', 'Artifact digest does not match its signed manifest')
  }
}

/**
 * Downloads and verifies an artifact, then stages it. Installation never points
 * `current` at the new version; callers activate only after their health check.
 */
export async function installArtifact({ manifest, download, extract, versionStore, freeSpace, signal } = {}) {
  throwIfAborted(signal)
  if (!versionStore?.stage || !versionStore?.stagingDir) throw new TypeError('A version store is required')
  if (extract !== undefined && typeof extract !== 'function') throw new TypeError('extract must be a function')
  const { artifact, extractedSize } = installArtifactMetadata(manifest)
  await fs.mkdir(versionStore.stagingDir, { recursive: true, mode: 0o700 })
  const requiredBytes = artifact.size + extractedSize + ARTIFACT_FRAMING_ALLOWANCE
  const freeBytes = freeSpace ? await freeSpace(versionStore.stagingDir) : await availableDiskBytes(versionStore.stagingDir)
  if (!Number.isSafeInteger(freeBytes) || freeBytes < requiredBytes) fail('DISK_SPACE_INSUFFICIENT', 'Insufficient disk space for artifact staging')
  if (typeof extract !== 'function') fail('EXTRACTOR_REQUIRED', 'A safe archive extractor must be supplied')

  const downloadKey = `${manifest.version}-${artifact.sha256}`
  const archive = path.join(versionStore.stagingDir, `${downloadKey}.part`)
  const metadataPath = path.join(versionStore.stagingDir, `${downloadKey}.json`)
  const destination = await versionStore.stage(manifest.version, async (stagingDirectory) => {
    throwIfAborted(signal)
    await downloadToFile({ url: artifact.url, download, destination: archive, artifact, metadataPath, signal })
    throwIfAborted(signal)
    await extractSafely({ archive, extract, destination: stagingDirectory, maximumBytes: extractedSize, signal })
    throwIfAborted(signal)
    await validateExtractedTree(stagingDirectory, extractedSize)
    throwIfAborted(signal)
    if (!await regularFile(path.join(stagingDirectory, 'bin', 'node')) || !await regularFile(path.join(stagingDirectory, 'app', 'server.mjs'))) {
      fail('ARTIFACT_LAYOUT_INVALID', 'Extracted artifact must contain bin/node and app/server.mjs')
    }
  }, { signal })
  throwIfAborted(signal)
  await removePartial(archive, metadataPath)
  return Object.freeze({ version: manifest.version, path: destination })
}
