import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const migratedFiles = [
  'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts',
  'packages/ui/src/main/utils/initPublicIpc.ts',
  'packages/ui/src/main/window/commonJobConditionConfigWindow.ts',
  'packages/ui/src/main/features/llm-request-log.ts'
]

for (const relativePath of migratedFiles) {
  const source = await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
  assert.doesNotMatch(source, /@geekgeekrun\/sqlite-plugin/, `${relativePath} must not access SQLite directly`)
  assert.doesNotMatch(source, /runtime-file-utils\.mjs/, `${relativePath} must not access runtime files directly`)
  assert.doesNotMatch(source, /utils\/db\//, `${relativePath} must not access database helpers directly`)
}

const ipcSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/backend/register-ipc.ts'),
  'utf8'
)
assert.match(ipcSource, /config\.read/, 'backend IPC adapters must read config through the backend client')
assert.match(ipcSource, /config\.write/, 'backend IPC adapters must write config through the backend client')
assert.match(ipcSource, /records\.list/, 'backend IPC adapters must list records through the backend client')

const publicIpcSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/utils/initPublicIpc.ts'),
  'utf8'
)
assert.match(publicIpcSource, /get-boss-session-status/, 'cookie IPC must expose a status-only channel')
const rawStorageReadHandler = publicIpcSource.match(
  /ipcMain\.handle\('read-storage-file',([\s\S]*?)\n  \}\)/
)?.[1]
assert.ok(rawStorageReadHandler, 'legacy storage read IPC must be explicitly rejected')
assert.match(rawStorageReadHandler, /Raw storage reads are not available/, 'legacy storage read IPC must reject raw reads')
assert.doesNotMatch(rawStorageReadHandler, /readBackendConfig/, 'legacy storage read IPC must not request backend cookie data')

const cookieRendererSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/renderer/src/page/CookieAssistant/index.vue'),
  'utf8'
)
assert.match(cookieRendererSource, /get-boss-session-status/, 'cookie UI must request session status instead of cookie values')
assert.doesNotMatch(cookieRendererSource, /read-storage-file/, 'cookie UI must not request raw cookie storage')

const cookieWindowSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/window/cookieAssistantWindow.ts'),
  'utf8'
)
const saveSessionHandler = cookieWindowSource.match(
  /const saveSessionHandler = async[\s\S]*?\n  \}/
)?.[0]
assert.ok(saveSessionHandler, 'cookie session save handler must exist')
assert.match(saveSessionHandler, /await sessionBridge\.saveSession/, 'cookie session save must await backend persistence')
assert.match(saveSessionHandler, /return \{ saved: true \}/, 'cookie session save must return a status DTO')
assert.doesNotMatch(saveSessionHandler, /return sessionBridge\.saveSession/, 'cookie session save must not return raw backend session data')

const clientSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/backend/client.ts'),
  'utf8'
)
assert.match(clientSource, /function onBackendConnected/, 'backend client must expose successful-connection notifications')
assert.match(clientSource, /if \(!backend\.connected\)[\s\S]*?notifyConnected\(backend\)/, 'request-triggered reconnects must notify event subscribers')

const eventsSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/backend/events.ts'),
  'utf8'
)
assert.match(eventsSource, /installBackendEventBridge/, 'event bridge must install a reconnect listener')
assert.match(eventsSource, /onBackendConnected\(registerBackendEvents\)/, 'event bridge must register after deferred backend connects')
assert.match(eventsSource, /subscribedClient === backend && unsubscribe/, 'event bridge must avoid duplicate listeners for one client')

const settingsSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts'),
  'utf8'
)
assert.match(settingsSource, /installBackendEventBridge\(\)[\s\S]*?await connectBackend\(\)/, 'event bridge must be installed before initial connection attempts')

console.log('backend boundary check passed')
