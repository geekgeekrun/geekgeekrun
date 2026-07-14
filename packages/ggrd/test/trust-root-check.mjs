import assert from 'node:assert/strict'
import { CHANNEL_MANIFEST_ENDPOINTS, createTrustRoot } from '../lib/trust-root.mjs'

assert.deepEqual(CHANNEL_MANIFEST_ENDPOINTS, {
  stable: 'https://github.com/geekgeekrun/geekgeekrun/releases/download/ggrd-stable/manifest.json',
  beta: 'https://github.com/geekgeekrun/geekgeekrun/releases/download/ggrd-beta/manifest.json'
})
assert.deepEqual(createTrustRoot().manifestEndpoints, CHANNEL_MANIFEST_ENDPOINTS)

console.log('ggrd trust root check passed')
