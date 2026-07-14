import { verify as verifySignature } from 'node:crypto'

export class ManifestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ManifestError'
    this.code = code
  }
}

function fail(code, message) { throw new ManifestError(code, message) }

function rawBytes(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  fail('MANIFEST_INVALID', 'rawManifest must be the original manifest bytes')
}

function signatureBytes(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (typeof value === 'string') return Buffer.from(value, 'base64')
  fail('SIGNATURE_INVALID', 'Detached signature is missing')
}

function semver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
  if (!match) return null
  const parts = match.slice(1, 4)
  if (parts.some((part) => part.length > 1 && part.startsWith('0'))) return null
  const prerelease = match[4]?.split('.') ?? null
  if (prerelease?.some((identifier) => !/^[0-9A-Za-z-]+$/.test(identifier) || (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')))) return null
  return { parts, prerelease }
}

function compareNumericIdentifiers(left, right) {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1
  return left === right ? 0 : left > right ? 1 : -1
}

function compareVersions(left, right) {
  const a = semver(left)
  const b = semver(right)
  if (!a || !b) fail('MANIFEST_INVALID', 'Client and manifest versions must be semantic versions')
  for (let index = 0; index < 3; index++) {
    if (a.parts[index] !== b.parts[index]) return compareNumericIdentifiers(a.parts[index], b.parts[index])
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === null) return 1
  if (b.prerelease === null) return -1
  const count = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < count; index++) {
    const left = a.prerelease[index]
    const right = b.prerelease[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) return compareNumericIdentifiers(left, right)
    if (leftNumeric) return -1
    if (rightNumeric) return 1
    return left < right ? -1 : 1
  }
  return 0
}

function protocolRange(manifest) {
  const source = manifest.protocol ?? manifest
  const min = source.min ?? source.minProtocolVersion ?? manifest.protocolMin
  const max = source.max ?? source.maxProtocolVersion ?? manifest.protocolMax
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
    fail('MANIFEST_INVALID', 'Manifest protocol range is invalid')
  }
  return { min, max }
}

function artifactFor(manifest, platform, arch) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : manifest.artifact ? [manifest.artifact] : []
  if (!artifacts.length) fail('MANIFEST_INVALID', 'Manifest has no artifacts')
  const forPlatform = artifacts.filter((artifact) => artifact && artifact.platform === platform)
  if (!forPlatform.length) fail('PLATFORM_UNSUPPORTED', `No artifact for ${platform}`)
  const artifact = forPlatform.find((candidate) => candidate.arch === arch)
  if (!artifact) fail('ARCH_UNSUPPORTED', `No ${arch} artifact for ${platform}`)
  return artifact
}

function validateArtifact(artifact) {
  if (typeof artifact.url !== 'string' || new URL(artifact.url).protocol !== 'https:') {
    fail('MANIFEST_INVALID', 'Artifact URL must use HTTPS')
  }
  if (typeof artifact.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(artifact.sha256)) {
    fail('DIGEST_INVALID', 'Artifact sha256 must be a 64-character hexadecimal digest')
  }
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) fail('MANIFEST_INVALID', 'Artifact size is invalid')
  for (const field of ['extractionSize', 'maxExtractedSize']) {
    if (artifact[field] !== undefined && (!Number.isSafeInteger(artifact[field]) || artifact[field] < 0)) {
      fail('MANIFEST_INVALID', `${field} is invalid`)
    }
  }
}

function validateDatabase(manifest) {
  const database = manifest.database ?? manifest.databaseCompatibility
  if (!database || !Number.isInteger(database.schemaVersion) || database.schemaVersion < 0) {
    fail('MANIFEST_INVALID', 'Manifest database compatibility metadata is required')
  }
  if (database.rollbackCompatible !== true) {
    fail('DATABASE_ROLLBACK_INCOMPATIBLE', 'Artifact database changes are not rollback compatible')
  }
  if (database.rehearsalEntrypoint !== 'app/migration.mjs') fail('MANIFEST_INVALID', 'Artifact database migration rehearsal entrypoint is required')
}

/**
 * Verifies a detached Ed25519 signature before parsing the untrusted JSON.
 * `rawManifest` is intentionally bytes rather than text so reformatting cannot
 * alter the signed payload.
 */
export function verifyManifest({ rawManifest, signature, publicKey, platform, arch, clientVersion, protocolVersion }) {
  const bytes = rawBytes(rawManifest)
  let valid = false
  try { valid = verifySignature(null, bytes, publicKey, signatureBytes(signature)) } catch { valid = false }
  if (!valid) fail('SIGNATURE_INVALID', 'Manifest detached signature is invalid')

  let manifest
  try { manifest = JSON.parse(bytes.toString('utf8')) } catch { fail('MANIFEST_INVALID', 'Signed manifest is not valid JSON') }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || typeof manifest.version !== 'string') {
    fail('MANIFEST_INVALID', 'Manifest has an invalid shape')
  }
  const artifact = artifactFor(manifest, platform, arch)
  validateArtifact(artifact)
  const range = protocolRange(manifest)
  if (!Number.isInteger(protocolVersion) || protocolVersion < range.min || protocolVersion > range.max) {
    fail('PROTOCOL_INCOMPATIBLE', 'Manifest does not support this protocol version')
  }
  if (typeof manifest.minClientVersion !== 'string' || typeof clientVersion !== 'string' || compareVersions(clientVersion, manifest.minClientVersion) < 0) {
    fail('CLIENT_VERSION_UNSUPPORTED', 'Client is older than the minimum supported version')
  }
  validateDatabase(manifest)
  return Object.freeze({ ...manifest, artifact: Object.freeze({ ...artifact }) })
}
