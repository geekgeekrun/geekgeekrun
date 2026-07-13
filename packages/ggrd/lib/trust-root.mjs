// This module is deliberately limited to public release metadata. Signing keys
// belong to the offline release process and must never be distributed to clients.
export const RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZ7McdxYF5TiZtfpsLXkJRr2UFkY2YNqdRp95TfJdHbw=
-----END PUBLIC KEY-----`

export const CHANNEL_MANIFEST_ENDPOINTS = Object.freeze({
  stable: 'https://updates.geekgeekrun.com/ggrd/stable/manifest.json',
  beta: 'https://updates.geekgeekrun.com/ggrd/beta/manifest.json'
})

export function createTrustRoot({ publicKey = RELEASE_PUBLIC_KEY, manifestEndpoints = CHANNEL_MANIFEST_ENDPOINTS } = {}) {
  for (const endpoint of Object.values(manifestEndpoints)) {
    if (new URL(endpoint).protocol !== 'https:') throw new TypeError('Manifest endpoints must use HTTPS')
  }
  return Object.freeze({ publicKey, manifestEndpoints: Object.freeze({ ...manifestEndpoints }) })
}
