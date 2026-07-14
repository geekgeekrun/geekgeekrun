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
assert.match(saveSessionHandler, /await writeBackendConfig\('boss_cookies', cookies\)/, 'cookie session save must await backend persistence')
assert.match(saveSessionHandler, /return \{ saved: true \}/, 'cookie session save must return a status DTO')
assert.doesNotMatch(saveSessionHandler, /return writeBackendConfig/, 'cookie session save must not return raw backend session data')

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
assert.match(eventsSource, /backendEvents\.emit\('event'/, 'event bridge must relay structured backend events')
assert.doesNotMatch(eventsSource, /daemonEE|connect-to-daemon/, 'event bridge must not depend on the legacy daemon adapter')

const settingsSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts'),
  'utf8'
)
assert.match(settingsSource, /installBackendEventBridge\(\)[\s\S]*?await connectBackend\(\)/, 'event bridge must be installed before initial connection attempts')

const electronMainSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/index.ts'),
  'utf8'
)
assert.doesNotMatch(electronMainSource, /switch\s*\(runMode\)/, 'Electron entry must not dispatch executable modes')
assert.doesNotMatch(electronMainSource, /--mode=/, 'Electron entry must not pass executable modes')
assert.doesNotMatch(electronMainSource, /launchDaemon/, 'Electron entry must not launch a local daemon')
assert.doesNotMatch(electronMainSource, /flow\/LAUNCH_|launch-daemon/, 'Electron entry must not import backend flows')

const readTask13Source = async (relativePath) => {
  try {
    return await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
  } catch (error) {
    assert.fail(`${relativePath} must exist: ${error.message}`)
  }
}

const supervisorClientSource = await readTask13Source('packages/ui/src/main/backend/supervisor-client.ts')
assert.match(supervisorClientSource, /supervisor\.status/, 'Electron must request only supervisor status through its supervisor client')
assert.match(supervisorClientSource, /update\.check/, 'Electron must request update checks through its supervisor client')
assert.match(supervisorClientSource, /update\.install/, 'Electron must request installs through its supervisor client')
assert.match(supervisorClientSource, /update\.rollback/, 'Electron must request rollbacks through its supervisor client')
assert.doesNotMatch(supervisorClientSource, /https?:\/\/|signature|artifact\.url|manifest\.artifact/i, 'Electron must not contain release URLs or signature material')

const bootstrapSource = await readTask13Source('packages/ui/src/main/backend/bootstrap.ts')
assert.match(bootstrapSource, /export async function ensureSupervisorInstalled/, 'production bootstrap must install the user-scoped supervisor')
assert.match(bootstrapSource, /export async function ensureBackendReady/, 'startup must wait for a ready backend')
assert.match(bootstrapSource, /pnpm dev:backend/, 'development backend failure must tell the user how to start it')
assert.doesNotMatch(bootstrapSource, /proxy.*(?:password|token|secret)|(?:password|token|secret).*proxy/i, 'proxy credentials must never be renderer-facing bootstrap data')
assert.match(electronMainSource, /ensureSupervisorInstalled\(\)[\s\S]*?ensureBackendReady\(\)[\s\S]*?openSettingWindow/, 'Electron must install the supervisor and ready the backend before opening a window')

const builderSource = await fs.readFile(path.join(repoRoot, 'packages/ui/electron-builder.yml'), 'utf8')
assert.match(builderSource, /ggrd-bootstrap/, 'Electron artifacts must ship the supervisor bootstrap')
assert.match(builderSource, /!.*ggr-backend/, 'Electron artifacts must exclude backend packages')
assert.match(builderSource, /!.*(?:better-sqlite3|sqlite-plugin)/, 'Electron artifacts must exclude backend native dependencies')

const updatePanelSource = await readTask13Source('packages/ui/src/renderer/src/components/BackendUpdatePanel.vue')
for (const channel of ['backend-update-status', 'backend-update-check', 'backend-update-install', 'backend-update-rollback']) {
  assert.match(updatePanelSource, new RegExp(channel), `renderer must use the restricted ${channel} channel`)
}
assert.doesNotMatch(updatePanelSource, /https?:\/\/|signature|artifact|\.geekgeekrun|\/Users\//i, 'renderer update UI must not receive release URLs, signatures, or paths')
const updateIpcSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts'),
  'utf8'
)
assert.match(updateIpcSource, /redactedUpdateFailure/, 'update IPC must return a redacted failure DTO instead of forwarding supervisor errors')
assert.doesNotMatch(updateIpcSource, /backend-update-install'[\s\S]{0,260}throw error/, 'update install IPC must not forward raw supervisor errors to the renderer')

const mainSourceRoot = path.join(repoRoot, 'packages/ui/src/main')
const sourceFiles = await fs.readdir(mainSourceRoot, { recursive: true })
for (const sourceFile of sourceFiles) {
  if (typeof sourceFile !== 'string' || !/\.(?:[cm]?[jt]s|vue)$/.test(sourceFile)) continue
  const relativePath = path.join('packages/ui/src/main', sourceFile)
  const source = await fs.readFile(path.join(mainSourceRoot, sourceFile), 'utf8')
  assert.doesNotMatch(source, /sendToDaemon/, `${relativePath} must use the backend client protocol`)
  assert.doesNotMatch(source, /connectToDaemon/, `${relativePath} must use the backend client protocol`)
  assert.doesNotMatch(source, /@geekgeekrun\/pm/, `${relativePath} must not import the legacy process manager`)
  assert.doesNotMatch(source, /downloadDependenciesForInit/, `${relativePath} must not execute backend browser flows directly`)
}

const rendererSourceRoot = path.join(repoRoot, 'packages/ui/src/renderer/src')
const rendererSourceFiles = await fs.readdir(rendererSourceRoot, { recursive: true })
for (const sourceFile of rendererSourceFiles) {
  if (typeof sourceFile !== 'string' || !/\.(?:[cm]?[jt]s|vue)$/.test(sourceFile)) continue
  const relativePath = path.join('packages/ui/src/renderer/src', sourceFile)
  const source = await fs.readFile(path.join(rendererSourceRoot, sourceFile), 'utf8')
  assert.doesNotMatch(source, /@geekgeekrun\/(?:sqlite-plugin|geek-auto-start-chat-with-boss)/, `${relativePath} must consume only protocol DTOs, IPC responses, and UI-local presentation data`)
  assert.doesNotMatch(source, /@geekgeekrun\/sqlite-plugin\/src\/(?:entity|utils)/, `${relativePath} must not import persistence entities or helpers`)
}

for (const relativePath of [
  'packages/ui/src/main/window/browserAssistantWindow.ts',
  'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts'
]) {
  const source = await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
  assert.doesNotMatch(source, /from ['"][^'"]*(?:DOWNLOAD_DEPENDENCIES|browser-history|puppeteer-executable|ggr-backend\/lib)/, `${relativePath} must not import backend browser dependencies directly`)
}

const taskIpcSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts'),
  'utf8'
)
assert.match(taskIpcSource, /return \{ workers: await requestBackend\('task\.list'\) \}/, 'task manager IPC must retain its workers envelope')
assert.match(taskIpcSource, /requestBackend<\{ taskId: string \}>\('browser\.openBoss', \{ url \}\)/, 'Boss IPC must pass the requested URL to the backend browser')
assert.match(taskIpcSource, /await waitForBrowserReady\(task\.taskId\)/, 'Boss IPC must wait for backend browser readiness')

const downloadSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/window/browserDownloadProgressWindow.ts'),
  'utf8'
)
assert.match(downloadSource, /requestBackend<\{ taskId: string \}>\('browser\.prepare'\)/, 'download UI must request a dependency-only backend browser task')
assert.match(downloadSource, /requestBackend\('browser\.cancel'/, 'closing download UI must cancel its backend task')
assert.match(downloadSource, /backendEvents\.on\('event'/, 'download UI must consume structured backend progress')
assert.match(downloadSource, /data\.state === 'completed'/, 'download UI must wait for definitive backend completion')

const bossWaitSource = taskIpcSource.match(/function waitForBrowserReady[\s\S]*?\n\}/)?.[0]
assert.ok(bossWaitSource, 'Boss readiness wait must exist')
assert.match(bossWaitSource, /requestBackend\('browser\.cancel'/, 'Boss readiness timeout must cancel the backend task')

assert.match(cookieWindowSource, /send\('BOSS_ZHIPIN_COOKIE_COLLECTED', session\)/, 'cookie UI must preserve its collected-session notification')
assert.match(cookieWindowSource, /readBackendConfig(?:<[^>]+>)?\('boss_cookies'\)/, 'cookie UI must confirm saved session through the status-only backend read')
assert.doesNotMatch(cookieWindowSource, /ipcMain\.emit\('cookie-saved'/, 'cookie UI must not close before the renderer processes session status')
assert.doesNotMatch(cookieWindowSource, /data\.cookies/, 'cookie UI must not expose raw cookies from backend events')
assert.match(cookieRendererSource, /payload\?\.configured/, 'cookie renderer must complete the status-only login flow without raw cookies')

const runCommonSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/features/run-common.ts'),
  'utf8'
)
assert.match(runCommonSource, /runRecordId: runningTask\.runRecordId/, 'existing tasks must reuse backend run correlation metadata')
assert.match(runCommonSource, /runRecordId: startedTask\.runRecordId/, 'new tasks must return backend run correlation metadata')
assert.doesNotMatch(runCommonSource, /runRecordId: null/, 'task starts must not return a null overlay correlation id')

const cookieInvalidSource = await fs.readFile(
  path.join(repoRoot, 'packages/ui/src/main/features/cookie-invalid-handle-plugin.ts'),
  'utf8'
)
assert.match(cookieInvalidSource, /await promptForLogin\(\)[\s\S]*?THROW_FOR_RETRY/, 'successful login must retry with the refreshed backend session')

console.log('backend boundary check passed')
