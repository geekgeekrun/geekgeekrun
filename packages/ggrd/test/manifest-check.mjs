import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'

import { verifyManifest } from '../lib/manifest.mjs'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')

function manifest(overrides = {}) {
  return {
    version: '1.2.3',
    artifacts: [{
      platform: 'linux', arch: 'x64',
      url: 'https://updates.example.test/ggrd-1.2.3.tar.gz',
      sha256: 'a'.repeat(64), size: 1024, extractionSize: 4096
    }],
    protocol: { min: 1, max: 2 },
    minClientVersion: '1.0.0',
    database: { schemaVersion: 2, rollbackCompatible: true },
    ...overrides
  }
}

function signed(value) {
  const rawManifest = Buffer.from(JSON.stringify(value))
  return { rawManifest, signature: sign(null, rawManifest, privateKey) }
}

{
  const { rawManifest, signature } = signed(manifest())
  const checked = verifyManifest({
    rawManifest, signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '1.0.0', protocolVersion: 1
  })
  assert.equal(checked.version, '1.2.3')
  assert.equal(checked.artifact.platform, 'linux')
}

{
  const { rawManifest, signature } = signed(manifest())
  const altered = Buffer.from(rawManifest)
  altered[altered.length - 2] ^= 1
  assert.throws(() => verifyManifest({
    rawManifest: altered, signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '1.0.0', protocolVersion: 1
  }), { code: 'SIGNATURE_INVALID' })
}

for (const [name, value, expected] of [
  ['wrong digest', manifest({ artifacts: [{ ...manifest().artifacts[0], sha256: 'not-a-digest' }] }), 'DIGEST_INVALID'],
  ['wrong platform', manifest(), 'PLATFORM_UNSUPPORTED'],
  ['wrong architecture', manifest(), 'ARCH_UNSUPPORTED'],
  ['unsupported protocol', manifest({ protocol: { min: 2, max: 3 } }), 'PROTOCOL_INCOMPATIBLE'],
  ['old client', manifest({ minClientVersion: '2.0.0' }), 'CLIENT_VERSION_UNSUPPORTED'],
  ['unsafe database rollback metadata', manifest({ database: { schemaVersion: 2, rollbackCompatible: false } }), 'DATABASE_ROLLBACK_INCOMPATIBLE']
]) {
  const { rawManifest, signature } = signed(value)
  const options = {
    rawManifest, signature, publicKey,
    platform: name === 'wrong platform' ? 'darwin' : 'linux',
    arch: name === 'wrong architecture' ? 'arm64' : 'x64',
    clientVersion: name === 'old client' ? '1.0.0' : '2.0.0',
    protocolVersion: 1
  }
  assert.throws(() => verifyManifest(options), { code: expected }, name)
}

{
  const { rawManifest, signature } = signed(manifest({ minClientVersion: '1.0.0-alpha.10' }))
  assert.throws(() => verifyManifest({
    rawManifest, signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '1.0.0-alpha.2', protocolVersion: 1
  }), { code: 'CLIENT_VERSION_UNSUPPORTED' }, 'numeric prerelease identifiers use numeric SemVer precedence')
}

{
  const numeric = signed(manifest({ minClientVersion: '1.0.0-alpha.beta' }))
  assert.throws(() => verifyManifest({
    rawManifest: numeric.rawManifest, signature: numeric.signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '1.0.0-alpha.1', protocolVersion: 1
  }), { code: 'CLIENT_VERSION_UNSUPPORTED' }, 'numeric prerelease identifiers sort before nonnumeric identifiers')
  const stable = signed(manifest({ minClientVersion: '1.0.0-alpha.1' }))
  assert.equal(verifyManifest({
    rawManifest: stable.rawManifest, signature: stable.signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '1.0.0', protocolVersion: 1
  }).version, '1.2.3', 'a stable release sorts after its prereleases')
}

{
  const { rawManifest, signature } = signed(manifest({ minClientVersion: '9007199254740993.0.0' }))
  assert.throws(() => verifyManifest({
    rawManifest, signature, publicKey,
    platform: 'linux', arch: 'x64', clientVersion: '9007199254740992.0.0', protocolVersion: 1
  }), { code: 'CLIENT_VERSION_UNSUPPORTED' }, 'large core SemVer identifiers retain their exact decimal precedence')
}

console.log('ggrd manifest check passed')
