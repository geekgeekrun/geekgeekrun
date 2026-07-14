import { Readable } from 'node:stream'
import { PROTOCOL_VERSION } from '@geekgeekrun/ggr-protocol'
import { installArtifact } from './installer.mjs'
import { verifyManifest } from './manifest.mjs'
import { createTrustRoot } from './trust-root.mjs'
import { extractTarGzip } from './tar-extractor.mjs'

function failure(code, message) {
  return Object.assign(new Error(message), { code })
}

async function responseBytes(response) {
  if (!response?.ok) throw failure('RELEASE_FETCH_FAILED', 'Signed backend release metadata could not be downloaded')
  return Buffer.from(await response.arrayBuffer())
}

function signatureEndpoint(manifestEndpoint) {
  if (!manifestEndpoint.endsWith('/manifest.json')) throw new TypeError('channel manifest endpoint must end in /manifest.json')
  return `${manifestEndpoint.slice(0, -'manifest.json'.length)}manifest.sig`
}

export function createReleaseService({
  versionStore,
  trustRoot = createTrustRoot(),
  channel = 'stable',
  fetchImpl = globalThis.fetch,
  extract = extractTarGzip,
  freeSpace,
  platform = process.platform,
  arch = process.arch,
  clientVersion = '1.0.0'
} = {}) {
  if (!versionStore?.stage || !versionStore?.stagingDir) throw new TypeError('a version store is required')
  if (typeof fetchImpl !== 'function' || typeof extract !== 'function') throw new TypeError('fetch and a safe extractor are required')
  const endpoint = trustRoot?.manifestEndpoints?.[channel]
  if (typeof endpoint !== 'string') throw new TypeError('the requested release channel is unavailable')

  async function checkForUpdates() {
    const [manifestResponse, signatureResponse] = await Promise.all([
      fetchImpl(endpoint), fetchImpl(signatureEndpoint(endpoint))
    ])
    const [rawManifest, signature] = await Promise.all([responseBytes(manifestResponse), responseBytes(signatureResponse)])
    return verifyManifest({ rawManifest, signature: signature.toString('utf8').trim(), publicKey: trustRoot.publicKey, platform, arch, clientVersion, protocolVersion: PROTOCOL_VERSION })
  }

  async function download({ url }) {
    const response = await fetchImpl(url)
    if (!response?.ok) throw failure('DOWNLOAD_FAILED', 'Backend artifact download failed')
    if (response.body) return { stream: Readable.fromWeb(response.body) }
    return { stream: Readable.from([Buffer.from(await response.arrayBuffer())]) }
  }

  return Object.freeze({
    checkForUpdates,
    install: async ({ manifest }) => installArtifact({ manifest, download, extract, versionStore, freeSpace })
  })
}
