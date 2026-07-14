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
function httpsUrl(value, label) { let url; try { url = new URL(value) } catch { throw failure('URL_INVALID', `${label} is invalid`) }; if (url.protocol !== 'https:') throw failure('URL_INSECURE', `${label} must use HTTPS`); return url }
async function fetchHttps(fetchImpl, value, options = {}) { let target = httpsUrl(value, 'Release URL'); for (let redirects = 0; redirects <= 5; redirects++) { const response = await fetchImpl(target.href, { ...options, redirect: 'manual' }); if (response?.status >= 300 && response.status < 400) { const location = response.headers?.get?.('location'); if (!location) throw failure('RELEASE_FETCH_FAILED', 'Release redirect is missing a location'); target = httpsUrl(new URL(location, target).href, 'Release redirect'); continue }; if (response?.url) httpsUrl(response.url, 'Release final redirect'); return response }; throw failure('RELEASE_FETCH_FAILED', 'Release download exceeded redirect limit') }

export function createReleaseService({
  versionStore,
  trustRoot = createTrustRoot(),
  channel = 'stable',
  fetchImpl = globalThis.fetch,
  extract = extractTarGzip,
  freeSpace,
  platform = process.platform,
  arch = process.arch,
  clientVersion,
  migrationService
} = {}) {
  if (!versionStore?.stage || !versionStore?.stagingDir) throw new TypeError('a version store is required')
  if (typeof fetchImpl !== 'function' || typeof extract !== 'function') throw new TypeError('fetch and a safe extractor are required')
  const endpoint = trustRoot?.manifestEndpoints?.[channel]
  if (typeof endpoint !== 'string') throw new TypeError('the requested release channel is unavailable')
  httpsUrl(endpoint, 'Release manifest endpoint')

  async function checkForUpdates() {
    const [manifestResponse, signatureResponse] = await Promise.all([
      fetchHttps(fetchImpl, endpoint), fetchHttps(fetchImpl, signatureEndpoint(endpoint))
    ])
    const [rawManifest, signature] = await Promise.all([responseBytes(manifestResponse), responseBytes(signatureResponse)])
    return verifyManifest({ rawManifest, signature: signature.toString('utf8').trim(), publicKey: trustRoot.publicKey, platform, arch, clientVersion, protocolVersion: PROTOCOL_VERSION })
  }

  async function download({ url, signal }) {
    const response = await fetchHttps(fetchImpl, url, { signal })
    if (!response?.ok) throw failure('DOWNLOAD_FAILED', 'Backend artifact download failed')
    if (response.body) return { stream: Readable.fromWeb(response.body) }
    return { stream: Readable.from([Buffer.from(await response.arrayBuffer())]) }
  }

  return Object.freeze({
    checkForUpdates,
    install: async ({ deadlineMs } = {}) => {
      const controller = new AbortController()
      let timer
      let deadlineError
      if (Number.isInteger(deadlineMs) && deadlineMs > 0) {
        timer = setTimeout(() => {
          deadlineError = failure('INSTALL_DEADLINE_EXCEEDED', 'Backend installation exceeded its deadline')
          controller.abort(deadlineError)
        }, deadlineMs)
      }
      try {
        const manifest = await checkForUpdates()
        const installation = await installArtifact({ manifest, download, extract, versionStore, freeSpace, signal: controller.signal })
        if (migrationService) await migrationService.rehearse({ version: installation.version, database: manifest.database ?? manifest.databaseCompatibility, versionsDir: versionStore.versionsDir })
        if (deadlineError) throw deadlineError
        return installation
      } catch (error) {
        if (deadlineError) throw deadlineError
        throw error
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
  })
}
