import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (relativePath) => fs.readFile(path.join(repoRoot, relativePath), 'utf8')

const presentationData = await read('packages/ui/src/renderer/src/domain/presentation-data.ts')
assert.match(presentationData, /presentationDataState/, 'presentation data must expose an explicit lifecycle state')
assert.match(presentationData, /presentationDataReady/, 'presentation data must expose readiness to controls')

for (const relativePath of [
  'packages/ui/src/renderer/src/page/MainLayout/GeekAutoStartChatWithBoss/index.vue',
  'packages/ui/src/renderer/src/page/CommonJobConditionConfig/index.vue'
]) {
  const source = await read(relativePath)
  assert.match(source, /v-loading="isPresentationDataLoading"/, `${relativePath} must block controls while dynamic presentation data loads`)
  assert.match(source, /@click="loadConfig"/, `${relativePath} must provide a retry action after config loading fails`)
  assert.match(source, /(?:catch \(error\)|\.catch\(\(error\))/, `${relativePath} must handle config loading errors`)
}

const cityChooser = await read('packages/ui/src/renderer/src/page/MainLayout/GeekAutoStartChatWithBoss/components/CityChooser.vue')
assert.match(cityChooser, /presentationDataReady/, 'CityChooser must not open with empty dynamic city data')

for (const relativePath of [
  'packages/ui/src/renderer/src/features/AnyCombineBossRecommendFilter/index.vue',
  'packages/ui/src/renderer/src/features/StaticCombineBossRecommendFilter/index.vue'
]) {
  const source = await read(relativePath)
  assert.match(source, /:disabled="\s*!presentationDataReady/, `${relativePath} must disable dynamic filter controls before config is ready`)
}

console.log('presentation data lifecycle check passed')
