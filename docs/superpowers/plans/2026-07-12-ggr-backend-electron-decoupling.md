# GGR Backend and Electron Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a persistent, independently updatable GGR backend that Electron, `ggr-mcp`, and CLI clients access through one local versioned protocol, without packaging backend business code inside Electron.

**Architecture:** Add a dependency-free wire contract in `ggr-protocol`, a reconnecting Unix-socket client in `ggr-client`, and a Node-based `ggr-backend` that owns tasks, SQLite, configuration, secrets, and browser automation. Add a stable `ggrd` supervisor that installs signed versioned backend artifacts, activates them atomically, monitors health, and rolls back failures; Electron only embeds the stable supervisor bootstrap and protocol clients.

**Tech Stack:** Node.js 20.16.0 ESM, TypeScript 5.3 for Electron-facing code, Unix domain sockets with JSON Lines, Electron 39.2.7, Vue 3, SQLite/TypeORM via `@geekgeekrun/sqlite-plugin`, Puppeteer 24.19, pnpm 10.33.2, macOS `launchd`, Node `crypto` Ed25519 verification.

## Global Constraints

- Initial production platform is macOS; path, process, and transport selection must remain injectable for later Windows Named Pipe support.
- The service is local-only and must not open a TCP listener.
- Electron must not open the backend SQLite database or read/write backend configuration and secret files directly.
- `ggr-backend` is the only owner of automation, SQLite, configuration, cookies, and browser runtime state.
- `ggrd` contains lifecycle/update logic only and no business logic.
- Development may run `ggr-backend` from source; production updates use self-contained signed artifacts with a pinned Node runtime.
- Protocol v1 evolves additively: no field removal or semantic change within the major version, and unknown optional fields/events are ignored.
- Backend artifacts declare `protocolMin`, `protocolMax`, `minClientVersion`, platform, architecture, database compatibility, release channel, size, URL, and SHA-256.
- Updates stage beside the active version, rehearse migrations on a copy, switch atomically, and retain exactly the active and previous healthy versions by default.
- Existing user changes, including the currently modified `README.md`, must not be overwritten or included in unrelated commits.

---

## File Map

### New protocol and client packages

- `packages/ggr-protocol/package.json` — package exports and test command.
- `packages/ggr-protocol/index.mjs` — protocol version, method/event constants, envelopes, handshake validation, and error serialization.
- `packages/ggr-protocol/index.d.ts` — stable DTOs consumed by TypeScript clients.
- `packages/ggr-protocol/test/check.mjs` — protocol compatibility and malformed-envelope checks.
- `packages/ggr-client/package.json` — local RPC client package metadata.
- `packages/ggr-client/index.mjs` — reconnecting request/event client with handshake.
- `packages/ggr-client/test/check.mjs` — framing, timeout, disconnect, and event subscription tests.

### New backend package

- `packages/ggr-backend/package.json` — independently runnable backend package and artifact entry point.
- `packages/ggr-backend/server.mjs` — production/development process entry.
- `packages/ggr-backend/lib/rpc-server.mjs` — JSONL socket server and connection lifecycle.
- `packages/ggr-backend/lib/router.mjs` — method registration and error mapping.
- `packages/ggr-backend/lib/runtime-paths.mjs` — injectable data/run/log locations and private permissions.
- `packages/ggr-backend/lib/services/config-service.mjs` — validated, atomic config reads/writes and redaction.
- `packages/ggr-backend/lib/services/approval-service.mjs` — approval queue ownership.
- `packages/ggr-backend/lib/services/task-service.mjs` — task state, worker lifecycle, and events.
- `packages/ggr-backend/lib/services/records-service.mjs` — all paginated SQLite reads.
- `packages/ggr-backend/lib/services/browser-service.mjs` — login, Boss site, and browser dependency operations.
- `packages/ggr-backend/lib/workers/` — Node worker entry points extracted from Electron main flows.
- `packages/ggr-backend/test/*.mjs` — service, RPC, database ownership, and worker lifecycle tests.

### Electron client migration

- `packages/ui/src/main/backend/client.ts` — single Electron business-client instance.
- `packages/ui/src/main/backend/supervisor-client.ts` — lifecycle/update client for `supervisor.sock`.
- `packages/ui/src/main/backend/register-ipc.ts` — maps existing renderer IPC channels to backend methods during migration.
- `packages/ui/src/main/backend/events.ts` — maps backend events to tray/window state.
- `packages/ui/src/main/backend/bootstrap.ts` — development connection and production first-run bootstrap.
- Existing files under `packages/ui/src/main/flow/OPEN_SETTING_WINDOW`, `features`, `window`, and `src/main/index.ts` — remove direct backend ownership and subprocess modes.
- Renderer files importing SQLite entities or backend implementation data — switch to protocol DTOs and UI-owned presentation data.

### MCP and controller migration

- `packages/ggr-controller/index.mjs` — become a protocol-backed controller facade; retain approval helper compatibility only until callers migrate.
- `packages/ggr-mcp/lib/agent-service.mjs` — connect to the persistent backend instead of spawning a local process.
- `packages/ggr-mcp/server.mjs` — keep MCP tool names while routing to backend methods.

### Supervisor and distribution

- `packages/ggrd/package.json` — stable supervisor package.
- `packages/ggrd/server.mjs` — supervisor process entry.
- `packages/ggrd/lib/version-store.mjs` — version directories and atomic symlink switching.
- `packages/ggrd/lib/manifest.mjs` — detached-signature, digest, and compatibility verification.
- `packages/ggrd/lib/installer.mjs` — download, stage, extract, and cleanup.
- `packages/ggrd/lib/backend-process.mjs` — health-gated process monitoring and crash-loop rollback.
- `packages/ggrd/lib/supervisor-api.mjs` — update/status/repair methods on `supervisor.sock`.
- `packages/ggrd/lib/launchd.mjs` — user LaunchAgent installation and repair.
- `packages/ggrd/test/*.mjs` — manifest, installation, activation, crash loop, and LaunchAgent tests.
- `scripts/build-ggr-backend-artifact.mjs` — self-contained backend artifact builder.
- `scripts/build-ggrd-bootstrap.mjs` — stable supervisor bootstrap builder for Electron resources.
- `scripts/sign-ggr-backend-manifest.mjs` — detached Ed25519 manifest signature.
- `.github/workflows/release-ggr-backend.yml` — backend-only build, sign, notarize, and publish pipeline.

---

### Task 1: Define protocol v1

**Files:**
- Create: `packages/ggr-protocol/package.json`
- Create: `packages/ggr-protocol/index.mjs`
- Create: `packages/ggr-protocol/index.d.ts`
- Create: `packages/ggr-protocol/test/check.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `PROTOCOL_VERSION`, `METHODS`, `EVENTS`, `createRequest(id, method, params)`, `createResult(id, result)`, `createError(id, code, message, data)`, `createEvent(event, data)`, and `assertHandshake(params)`.
- Produces DTOs: `HandshakeParams`, `HandshakeResult`, `SystemHealthResult`, `TaskSummary`, `PageRequest`, `PageResult<T>`, and `RpcErrorShape`.

- [ ] **Step 1: Write the failing protocol contract test**

```javascript
import assert from 'node:assert/strict'
import {
  EVENTS,
  METHODS,
  PROTOCOL_VERSION,
  assertHandshake,
  createError,
  createRequest
} from '../index.mjs'

assert.equal(PROTOCOL_VERSION, 1)
assert.equal(METHODS.SYSTEM_HANDSHAKE, 'system.handshake')
assert.equal(METHODS.TASK_START, 'task.start')
assert.equal(EVENTS.TASK_PROGRESS, 'task.progress')
assert.deepEqual(createRequest('r1', METHODS.TASK_START, { workerId: 'geekAutoStartWithBossMain' }), {
  id: 'r1', method: 'task.start', params: { workerId: 'geekAutoStartWithBossMain' }
})
assert.equal(assertHandshake({ client: 'electron', clientVersion: '0.17.4', protocolVersion: 1 }).client, 'electron')
assert.throws(() => assertHandshake({ client: '', protocolVersion: 1 }), /clientVersion/)
assert.deepEqual(createError('r2', 'METHOD_NOT_FOUND', 'missing'), {
  id: 'r2', error: { code: 'METHOD_NOT_FOUND', message: 'missing' }
})
console.log('ggr-protocol check passed')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node packages/ggr-protocol/test/check.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `packages/ggr-protocol/index.mjs`.

- [ ] **Step 3: Implement the protocol constants, envelopes, validators, and declarations**

```javascript
export const PROTOCOL_VERSION = 1
export const METHODS = Object.freeze({
  SYSTEM_HANDSHAKE: 'system.handshake', SYSTEM_HEALTH: 'system.health',
  TASK_LIST: 'task.list', TASK_START: 'task.start', TASK_STOP: 'task.stop',
  CONFIG_READ: 'config.read', CONFIG_WRITE: 'config.write',
  ACCOUNT_STATUS: 'account.status', RECORDS_LIST: 'records.list',
  BROWSER_OPEN_LOGIN: 'browser.openLogin', BROWSER_OPEN_BOSS: 'browser.openBoss',
  APPROVAL_LIST: 'approval.list', APPROVAL_APPROVE: 'approval.approve',
  APPROVAL_REQUIRE_HUMAN: 'approval.requireHuman'
})
export const EVENTS = Object.freeze({
  TASK_PROGRESS: 'task.progress', TASK_EXITED: 'task.exited',
  APPROVAL_REQUIRED: 'approval.required', SYSTEM_STATUS: 'system.status'
})
export const createRequest = (id, method, params = {}) => ({ id, method, params })
export const createResult = (id, result) => ({ id, result })
export const createError = (id, code, message, data) => ({
  id, error: { code, message, ...(data === undefined ? {} : { data }) }
})
export const createEvent = (event, data) => ({ event, data })
export function assertHandshake(value) {
  if (!value || typeof value.client !== 'string' || !value.client ||
      typeof value.clientVersion !== 'string' || !value.clientVersion ||
      !Number.isInteger(value.protocolVersion)) {
    throw new TypeError('client, clientVersion, and integer protocolVersion are required')
  }
  return value
}
```

Create matching exact declarations in `index.d.ts`; declare `SystemHealthResult` as `{ ready: boolean; version: string; protocolVersion: number }`, declare `TaskSummary` with `workerId`, `status`, `pid`, `startedAt`, and `lastError`, and declare `PageResult<T>` as `{ items: T[]; total: number; page: number; pageSize: number }`.

- [ ] **Step 4: Register package scripts and run the test**

Add `"test:ggr-protocol": "node ./packages/ggr-protocol/test/check.mjs"` to the root scripts and set the package test command to `node ./test/check.mjs`.

Run: `pnpm test:ggr-protocol`

Expected: `ggr-protocol check passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/ggr-protocol
git commit -m "feat: define ggr local protocol v1"
```

### Task 2: Build the reusable local RPC client

**Files:**
- Create: `packages/ggr-client/package.json`
- Create: `packages/ggr-client/index.mjs`
- Create: `packages/ggr-client/test/check.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: protocol envelope functions and `METHODS.SYSTEM_HANDSHAKE` from Task 1.
- Produces: `createGgrClient({ socketPath, client, clientVersion, protocolVersion, connectTimeoutMs, requestTimeoutMs })` returning `{ connect, request, onEvent, close, connected }`.

- [ ] **Step 1: Write a failing socket client integration test**

Create a temporary `net.createServer` that reads newline-delimited requests. It must return a handshake result, return `{ ok: true }` for `system.health`, and emit `task.progress`. Assert:

```javascript
const client = createGgrClient({ socketPath, client: 'test', clientVersion: '1.0.0' })
const events = []
client.onEvent((message) => events.push(message))
await client.connect()
assert.deepEqual(await client.request('system.health'), { ok: true })
assert.equal(events[0].event, 'task.progress')
await client.close()
```

Also assert a missing response rejects with `REQUEST_TIMEOUT` and socket closure rejects all pending requests with `CONNECTION_CLOSED`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node packages/ggr-client/test/check.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `packages/ggr-client/index.mjs`.

- [ ] **Step 3: Implement newline framing, handshake, requests, and cleanup**

Implement a buffer-based parser that only parses complete lines, uses `randomUUID()` request IDs, stores pending resolvers in a `Map`, clears timers on resolution, and treats event envelopes separately. `connect()` must send `system.handshake` before resolving. `close()` must destroy the socket and reject outstanding requests.

Use this public shape exactly:

```javascript
export function createGgrClient(options) {
  let socket = null
  let connected = false
  const pending = new Map()
  const eventListeners = new Set()
  return {
    async connect() { /* connect socket, parse lines, perform handshake */ },
    async request(method, params = {}, { timeoutMs = options.requestTimeoutMs ?? 10000 } = {}) {
      /* write createRequest(randomUUID(), method, params) plus newline */
    },
    onEvent(listener) { eventListeners.add(listener); return () => eventListeners.delete(listener) },
    async close() { /* reject pending requests and destroy socket */ },
    get connected() { return connected }
  }
}
```

- [ ] **Step 4: Run protocol and client tests**

Run: `pnpm test:ggr-protocol && node packages/ggr-client/test/check.mjs`

Expected: both checks pass with no open socket handles.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/ggr-client
git commit -m "feat: add local ggr rpc client"
```

### Task 3: Start a standalone backend with config ownership

**Files:**
- Create: `packages/ggr-backend/package.json`
- Create: `packages/ggr-backend/server.mjs`
- Create: `packages/ggr-backend/lib/runtime-paths.mjs`
- Create: `packages/ggr-backend/lib/rpc-server.mjs`
- Create: `packages/ggr-backend/lib/router.mjs`
- Create: `packages/ggr-backend/lib/services/config-service.mjs`
- Create: `packages/ggr-backend/lib/logger.mjs`
- Create: `packages/ggr-backend/test/server-check.mjs`
- Create: `packages/ggr-backend/test/legacy-layout-check.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 protocol envelopes and Task 2 client in tests.
- Produces: `createBackendServer({ socketPath, version, services })`, `createRuntimePaths(homeDir)`, and config handlers for `config.read`/`config.write`.

- [ ] **Step 1: Write the failing backend server test**

Start the backend against a temporary home and assert:

```javascript
const runtimePaths = createRuntimePaths(tempHome)
const backend = await createBackendServer({ socketPath: runtimePaths.backendSocket, version: '0.1.0', runtimePaths })
await backend.start()
const client = createGgrClient({ socketPath: runtimePaths.backendSocket, client: 'test', clientVersion: '1.0.0' })
await client.connect()
assert.deepEqual(await client.request('system.health'), { ready: true, version: '0.1.0', protocolVersion: 1 })
await client.request('config.write', { resource: 'opening_message', patch: { openingMessage: 'hello' } })
assert.equal((await client.request('config.read', { resource: 'opening_message' })).data.openingMessage, 'hello')
assert.equal((await fs.stat(path.join(runtimePaths.configDir, 'boss.json'))).mode & 0o777, 0o600)
```

Assert traversal-like resource names and writes to `runtime_status` return `INVALID_PARAMS`, and secret-shaped fields are returned as `[redacted]`.

- [ ] **Step 2: Run the backend test and verify it fails**

Run: `node packages/ggr-backend/test/server-check.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the backend server.

- [ ] **Step 3: Implement paths, router, and RPC server**

`createRuntimePaths(homeDir)` must return paths below `<homeDir>/.geekgeekrun/{runtime,run,data,logs}`. The RPC server must unlink only an existing socket owned by the current user, create its parent with mode `0700`, listen with mode `0600`, require `system.handshake` as the first request, and map thrown errors to stable error codes. Keep peer-credential verification behind an injected `verifyPeer(socket)` adapter; use socket ownership and permissions on Node/macOS until a supported peer-credential implementation is available, and fail closed if a configured verifier rejects the peer.

Use handler registration shaped as:

```javascript
const handlers = new Map()
export const register = (method, handler) => handlers.set(method, handler)
export async function dispatch(request, context) {
  const handler = handlers.get(request.method)
  if (!handler) throw Object.assign(new Error(`Unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  return handler(request.params ?? {}, context)
}
```

- [ ] **Step 4: Move config ownership behind backend services**

Extract the whitelist, deep merge, atomic private JSON write, corruption backup, and recursive redaction behavior currently in `packages/ggr-controller/index.mjs` into `config-service.mjs`. Do not expose arbitrary filenames; accept only the named resources used by `APP_DATA_RESOURCES`.

Implement `logger.mjs` with JSON lines, correlation IDs taken from RPC request IDs, recursive secret redaction, mode `0600`, size-based rotation, and an injected clock. Add assertions to `server-check.mjs` that a request ID appears in its log record while token/password values do not.

- [ ] **Step 5: Preserve existing user data during the layout transition**

Add `legacy-layout-check.mjs` with fixtures at `~/.geekgeekrun/config`, `~/.geekgeekrun/storage`, and `~/.geekgeekrun/storage/public.db`. On first decoupled start, copy and fsync them into `data/config`, `data/storage`, and `data/database.sqlite`, then atomically replace the legacy locations with user-private relative symlinks so the previous coupled release can still read them after rollback. If any copy or verification fails, restore the legacy paths and do not write the data-layout version marker.

- [ ] **Step 6: Add development scripts and run tests**

Add root scripts:

```json
"dev:backend": "GGR_BACKEND_DEV=1 node ./packages/ggr-backend/server.mjs",
"test:ggr-backend": "node ./packages/ggr-backend/test/server-check.mjs"
```

Run: `node packages/ggr-backend/test/legacy-layout-check.mjs && pnpm test:ggr-backend && pnpm test:ggr-protocol`

Expected: both checks pass; the temporary socket and files are removed by test cleanup.

- [ ] **Step 7: Commit**

```bash
git add package.json packages/ggr-backend
git commit -m "feat: start standalone ggr backend"
```

### Task 4: Move approvals and task lifecycle into the backend

**Files:**
- Create: `packages/ggr-backend/lib/services/approval-service.mjs`
- Create: `packages/ggr-backend/lib/services/task-service.mjs`
- Create: `packages/ggr-backend/test/task-service-check.mjs`
- Modify: `packages/ggr-backend/lib/router.mjs`
- Modify: `packages/ggr-backend/server.mjs`
- Modify: `packages/ggr-controller/index.mjs`
- Modify: `packages/ggr-controller/test/check.mjs`

**Interfaces:**
- Produces: `createTaskService({ spawnProcess, workerEntries, emit, stopTimeoutMs })` with `list()`, `start({ workerId, options })`, `stop({ workerId })`, and `stopAll()`.
- Produces backend methods: `task.list`, `task.start`, `task.stop`, `approval.list`, `approval.approve`, and `approval.requireHuman`.

- [ ] **Step 1: Write failing task lifecycle tests**

Use fake EventEmitter children and assert concurrent starts share one worker, explicit stop sends `SIGTERM`, timeout escalates to `SIGKILL`, exit emits one `task.exited`, and a user-stopped worker is not restarted.

```javascript
const service = createTaskService({ spawnProcess, workerEntries: { auto: '/tmp/auto.mjs' }, emit, stopTimeoutMs: 10 })
const [first, second] = await Promise.all([
  service.start({ workerId: 'auto' }), service.start({ workerId: 'auto' })
])
assert.equal(first.pid, second.pid)
assert.equal(spawnCalls.length, 1)
await service.stop({ workerId: 'auto' })
assert.deepEqual(killSignals, ['SIGTERM'])
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node packages/ggr-backend/test/task-service-check.mjs`

Expected: FAIL because `createTaskService` is not exported.

- [ ] **Step 3: Implement task state and approval handlers**

Port only the process-management behavior required from `packages/pm/daemon.js`; do not port GUI registration, Electron detection, or arbitrary `command`/`args` execution. The backend selects a fixed entry from `workerEntries`, preventing clients from spawning arbitrary executables.

Move approval queue locking and mutation from `packages/ggr-controller/index.mjs` into `approval-service.mjs`. Temporarily re-export wrappers from `ggr-controller` so existing tests and tray behavior remain green during migration.

- [ ] **Step 4: Register handlers and event publication**

Wire `task.*` and `approval.*` methods into the router. Map worker output into bounded diagnostic lines, but publish only structured `task.progress`, `task.exited`, and `approval.required` events. Redact output before persistence or broadcast.

- [ ] **Step 5: Run backend and controller regression tests**

Run: `node packages/ggr-backend/test/task-service-check.mjs && pnpm --filter @geekgeekrun/ggr-controller test`

Expected: both checks pass, including the existing concurrent lifecycle and approval queue assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/ggr-backend packages/ggr-controller
git commit -m "feat: move task lifecycle into ggr backend"
```

### Task 5: Extract automation workers, database queries, and browser operations

**Files:**
- Create: `packages/ggr-backend/lib/workers/auto-chat.mjs`
- Create: `packages/ggr-backend/lib/workers/read-no-reply.mjs`
- Create: `packages/ggr-backend/lib/services/records-service.mjs`
- Create: `packages/ggr-backend/lib/services/browser-service.mjs`
- Create: `packages/ggr-backend/lib/services/migration-service.mjs`
- Create: `packages/ggr-backend/test/records-service-check.mjs`
- Create: `packages/ggr-backend/test/migration-check.mjs`
- Create: `packages/ggr-backend/test/worker-entry-check.mjs`
- Move: `packages/ui/src/main/flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/*` to `packages/ggr-backend/lib/workers/read-no-reply/`
- Move: backend-only logic from `packages/ui/src/main/flow/LAUNCH_BOSS_SITE/index.ts` to `packages/ggr-backend/lib/services/browser/open-boss.mjs`
- Move: backend-only logic from `packages/ui/src/main/flow/LAUNCH_BOSS_ZHIPIN_LOGIN_PAGE_WITH_PRELOAD_EXTENSION.ts` to `packages/ggr-backend/lib/services/browser/open-login.mjs`
- Move: browser dependency logic from `packages/ui/src/main/flow/DOWNLOAD_DEPENDENCIES/` to `packages/ggr-backend/lib/services/browser/dependencies/`
- Modify: `packages/ggr-backend/package.json`
- Modify: `packages/ggr-backend/server.mjs`

**Interfaces:**
- Consumes: Task 4 fixed worker entry map and events.
- Produces record methods accepting `{ resource, page, pageSize, filters }` and returning `PageResult<Record<string, unknown>>`.
- Produces browser methods returning `{ taskId, state }`; browser progress is sent as `task.progress`.

- [ ] **Step 1: Write failing database ownership and pagination tests**

Create a temporary SQLite fixture through `@geekgeekrun/sqlite-plugin`, call `records.list`, and assert page bounds, stable totals, DTO serialization, and rejection of an unknown `resource`. Add a static assertion that `records-service.mjs` is the only new layer importing database entities.

- [ ] **Step 2: Write failing worker entry tests**

Import each worker with injected `runtime`, `taskReporter`, and `shouldStop` dependencies. Assert imports do not require `electron`, do not parse Electron `--mode` arguments, and translate completion/failure into structured task events.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `node packages/ggr-backend/test/records-service-check.mjs && node packages/ggr-backend/test/worker-entry-check.mjs`

Expected: FAIL because the services and worker entries do not exist.

- [ ] **Step 4: Move the auto-chat Node entry and normalize worker injection**

Use `packages/run-core-of-geek-auto-start-chat-with-boss/main.mjs` as the initial source for `auto-chat.mjs`. Export:

```javascript
export async function runAutoChat({ runtime, taskReporter, shouldStop }) {
  while (!(await shouldStop())) {
    await runtime.runOnce({ taskReporter })
  }
}
```

Keep the existing plugin hooks and restart policy in backend-owned modules. Remove `process.exit()` from business functions; convert known exit reasons to errors with stable `code` fields.

- [ ] **Step 5: Move the read-no-reply and browser flows**

Move the existing sources, replace `sendToDaemon(...)` with injected `taskReporter.emit(...)`, replace `connectToDaemon()`/worker registration with the Task 4 worker wrapper, and replace Electron window/process calls with backend-owned Puppeteer operations. UI-only dialogs remain in Electron and react to protocol results/errors.

- [ ] **Step 6: Implement records and browser services**

Port the query switch from `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/utils/db/worker/index.ts` into a whitelist-based records service. Initialize one backend-owned database connection, serialize entities into DTOs, and close it during backend shutdown. Register `records.list`, `account.status`, `browser.openLogin`, and `browser.openBoss`.

- [ ] **Step 7: Implement database rehearsal, backup, and compatibility checks**

Implement `rehearseMigrations({ sourceDb, candidateVersion, compatibility })` by copying the live database into a private staging directory, running candidate migrations only against the copy, and deleting the copy after validation. Implement `backupLiveDatabase()` using SQLite's backup API before activation. Reject destructive migrations unless manifest compatibility declares the previous version readable; test a deliberately failing migration and assert the live database hash is unchanged.

- [ ] **Step 8: Run backend, SQLite, and legacy behavior tests**

Run: `pnpm --filter @geekgeekrun/sqlite-plugin build && node packages/ggr-backend/test/records-service-check.mjs && node packages/ggr-backend/test/migration-check.mjs && node packages/ggr-backend/test/worker-entry-check.mjs && pnpm test:ui`

Expected: all checks pass; no backend worker imports `electron`.

- [ ] **Step 9: Commit**

```bash
git add packages/ggr-backend packages/ui/src/main/flow packages/run-core-of-geek-auto-start-chat-with-boss
git commit -m "feat: extract automation runtime from electron"
```

### Task 6: Add Electron BackendClient and migrate config/records IPC

**Files:**
- Create: `packages/ui/src/main/backend/client.ts`
- Create: `packages/ui/src/main/backend/events.ts`
- Create: `packages/ui/src/main/backend/register-ipc.ts`
- Create: `packages/ui/test/backend-boundary-check.mjs`
- Modify: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`
- Modify: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts`
- Modify: `packages/ui/src/main/utils/initPublicIpc.ts`
- Modify: `packages/ui/src/main/window/commonJobConditionConfigWindow.ts`
- Modify: `packages/ui/src/main/features/llm-request-log.ts`
- Modify: `packages/ui/package.json`

**Interfaces:**
- Consumes: `createGgrClient` and protocol DTOs.
- Produces: `getBackendClient(): BackendClient`, `connectBackend(): Promise<SystemHealthResult>`, and `registerBackendIpc(): void`.

- [ ] **Step 1: Write the failing boundary test**

Add assertions that Electron main no longer imports `@geekgeekrun/sqlite-plugin`, `runtime-file-utils.mjs`, or database entities from the migrated IPC/config/records files, and that `register-ipc.ts` invokes `config.read`, `config.write`, and `records.list`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node packages/ui/test/backend-boundary-check.mjs`

Expected: FAIL listing the current direct backend imports.

- [ ] **Step 3: Implement the singleton Electron backend client**

```typescript
import { createGgrClient } from '@geekgeekrun/ggr-client'

let client: ReturnType<typeof createGgrClient> | undefined
export function getBackendClient() {
  client ??= createGgrClient({
    socketPath: getBackendSocketPath(), client: 'electron',
    clientVersion: app.getVersion(), protocolVersion: 1
  })
  return client
}
export async function connectBackend() {
  await getBackendClient().connect()
  return getBackendClient().request('system.health')
}
```

Keep the backend connection in Electron main; renderer processes continue using restricted Electron IPC.

- [ ] **Step 4: Migrate config and records IPC handlers**

Preserve existing renderer channel names for this task, but implement them as `BackendClient.request(...)` adapters. Map backend error codes into serializable Electron errors. Remove the database worker and direct runtime file access only after every old handler has a protocol equivalent.

- [ ] **Step 5: Route backend events to existing window/tray consumers**

Translate `task.progress`, `task.exited`, `approval.required`, and `system.status` into the current internal EventEmitter shape so UI behavior remains unchanged while `connect-to-daemon.ts` is retired in Task 7.

- [ ] **Step 6: Run UI typechecks and boundary tests**

Run: `node packages/ui/test/backend-boundary-check.mjs && pnpm --filter geekgeekrun-ui typecheck && pnpm test:ui`

Expected: all pass; migrated files contain no direct SQLite or runtime-file imports.

- [ ] **Step 7: Commit**

```bash
git add packages/ui packages/ggr-client packages/ggr-protocol pnpm-lock.yaml
git commit -m "refactor: route electron data access through backend"
```

### Task 7: Migrate Electron task/browser control and remove executable modes

**Files:**
- Modify: `packages/ui/src/main/index.ts`
- Modify: `packages/ui/src/main/features/run-common.ts`
- Modify: `packages/ui/src/main/features/tray.ts`
- Modify: `packages/ui/src/main/features/cookie-invalid-handle-plugin.ts`
- Modify: `packages/ui/src/main/features/open-browser-download-window.ts`
- Modify: `packages/ui/src/main/window/browserDownloadProgressWindow.ts`
- Modify: `packages/ui/src/main/window/cookieAssistantWindow.ts`
- Modify: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`
- Delete: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/connect-to-daemon.ts`
- Delete: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/launch-daemon.ts`
- Delete: `packages/ui/src/main/flow/LAUNCH_DAEMON.ts`
- Delete: backend flow files moved in Task 5
- Modify: `packages/ui/test/backend-boundary-check.mjs`
- Modify: `packages/ui/test/check.mjs`

**Interfaces:**
- Consumes: Electron `BackendClient` from Task 6.
- Produces: UI task and browser actions exclusively through `task.*` and `browser.*` methods.

- [ ] **Step 1: Extend the failing boundary test**

Assert `packages/ui/src/main/index.ts` contains no `switch (runMode)`, `--mode=`, `launchDaemon`, or backend flow imports. Assert the Electron source tree contains no `sendToDaemon`, `connectToDaemon`, or `@geekgeekrun/pm` references.

- [ ] **Step 2: Run the boundary test and verify it fails**

Run: `node packages/ui/test/backend-boundary-check.mjs`

Expected: FAIL on all remaining daemon and subprocess-mode references.

- [ ] **Step 3: Replace task control**

Change `runCommon`, tray actions, stop handlers, and task-manager IPC to call:

```typescript
await getBackendClient().request('task.start', { workerId, options: { headless } })
await getBackendClient().request('task.stop', { workerId })
await getBackendClient().request('task.list')
```

Do not send a client-provided executable, arguments, or environment variables.

- [ ] **Step 4: Replace browser subprocess modes**

Map cookie/login, Boss-site, and dependency-download UI actions to `browser.openLogin`, `browser.openBoss`, and structured progress events. Keep window rendering and user prompts in Electron; remove all self-spawn calls using `process.argv[0]`.

- [ ] **Step 5: Simplify the Electron entry point and delete old daemon code**

The default entry must bootstrap the backend connection, register IPC, and open the setting window. Remove internal and user command modes. Delete the old daemon connection/launch files and their now-dead event adapters.

- [ ] **Step 6: Run full UI checks**

Run: `node packages/ui/test/backend-boundary-check.mjs && pnpm --filter geekgeekrun-ui typecheck && pnpm test:ui`

Expected: all pass; `rg -n "sendToDaemon|connectToDaemon|--mode=launchDaemon|@geekgeekrun/pm" packages/ui/src` returns no matches.

- [ ] **Step 7: Commit**

```bash
git add packages/ui
git commit -m "refactor: make electron a backend client"
```

### Task 8: Remove renderer imports of backend internals

**Files:**
- Modify: `packages/ui/src/renderer/src/page/CommonJobConditionConfig/index.vue`
- Modify: `packages/ui/src/renderer/src/features/JobSourceDragOrderer/index.vue`
- Modify: record and history components importing SQLite entity types
- Modify: filter components importing backend internal JSON/calculators
- Modify: `packages/ui/src/renderer/src/page/MainLayout/GeekAutoStartChatWithBoss/`
- Create: `packages/ui/src/renderer/src/domain/presentation-data.ts`
- Modify: `packages/ui/test/backend-boundary-check.mjs`

**Interfaces:**
- Consumes: protocol DTO declarations from Task 1 and Electron IPC responses from Task 6.
- Produces: UI-local enums/presentation constants that contain no persistence behavior.

- [ ] **Step 1: Add failing renderer boundary assertions**

Assert no renderer file imports `@geekgeekrun/sqlite-plugin`, `@geekgeekrun/geek-auto-start-chat-with-boss`, database entities, or backend internal JSON.

- [ ] **Step 2: Run and verify failure**

Run: `node packages/ui/test/backend-boundary-check.mjs`

Expected: FAIL with the current renderer import list.

- [ ] **Step 3: Replace entity types and enums**

Use `PageResult<RecordDto>` and named wire DTOs from `@geekgeekrun/ggr-protocol`. Copy only presentation-safe enum values into `presentation-data.ts`; backend validation remains authoritative.

- [ ] **Step 4: Serve dynamic filter/city data through config API**

Add read-only config resources for filter conditions, industry exemptions, and city groups, then load them through existing renderer IPC on page initialization. Keep sample-only form defaults as UI assets if they never affect backend validation.

- [ ] **Step 5: Run renderer checks**

Run: `node packages/ui/test/backend-boundary-check.mjs && pnpm --filter geekgeekrun-ui typecheck:web`

Expected: pass; the renderer has no backend implementation imports.

- [ ] **Step 6: Commit**

```bash
git add packages/ui packages/ggr-backend packages/ggr-protocol
git commit -m "refactor: remove backend internals from renderer"
```

### Task 9: Convert `ggr-mcp` and `ggr-controller` to protocol clients

**Files:**
- Modify: `packages/ggr-controller/index.mjs`
- Modify: `packages/ggr-controller/test/check.mjs`
- Modify: `packages/ggr-mcp/lib/agent-service.mjs`
- Modify: `packages/ggr-mcp/server.mjs`
- Modify: `packages/ggr-mcp/test/check.mjs`
- Modify: `packages/ggr-mcp/package.json`

**Interfaces:**
- Consumes: `createGgrClient` and backend protocol methods.
- Produces: `createBackendController({ client })` with `getStatus`, `start`, `stop`, `readAppData`, `updateAppData`, and approval methods.

- [ ] **Step 1: Write a failing fake-client controller test**

```javascript
const calls = []
const controller = createBackendController({
  client: { request: async (method, params) => { calls.push([method, params]); return { ok: true } } }
})
await controller.start({ headless: true })
assert.deepEqual(calls[0], ['task.start', {
  workerId: 'geekAutoStartWithBossMain', options: { headless: true }
}])
```

Assert no controller or MCP source references `child_process`, `repoRoot`, `daemon-main.mjs`, direct config paths, or approval queue files.

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm --filter @geekgeekrun/ggr-controller test && pnpm --filter @geekgeekrun/ggr-mcp test`

Expected: FAIL because the local process controller is still used.

- [ ] **Step 3: Implement the backend controller facade**

Map the existing public operations to `system.health`, `task.start`, `task.stop`, `config.read`, `config.write`, and `approval.*`. Remove local file mutation and process spawning after the MCP service uses the new facade.

- [ ] **Step 4: Update MCP descriptions and lifecycle**

Retain tool names and input schemas, but describe the persistent local backend instead of a child process. Connect once at server startup, reconnect on broken connections, and turn protocol errors into MCP `isError` results without writing non-JSON output to stdout.

- [ ] **Step 5: Run controller, MCP, and backend integration tests**

Run: `pnpm --filter @geekgeekrun/ggr-controller test && pnpm --filter @geekgeekrun/ggr-mcp test && pnpm test:ggr-backend`

Expected: all pass; `rg -n "child_process|daemon-main|approvalQueueFilePath|configDir" packages/ggr-mcp packages/ggr-controller` returns no production matches.

- [ ] **Step 6: Commit**

```bash
git add packages/ggr-controller packages/ggr-mcp pnpm-lock.yaml
git commit -m "refactor: connect ggr mcp to persistent backend"
```

### Task 10: Implement signed version storage and artifact installation in `ggrd`

**Files:**
- Create: `packages/ggrd/package.json`
- Create: `packages/ggrd/lib/version-store.mjs`
- Create: `packages/ggrd/lib/manifest.mjs`
- Create: `packages/ggrd/lib/installer.mjs`
- Create: `packages/ggrd/lib/trust-root.mjs`
- Create: `packages/ggrd/test/manifest-check.mjs`
- Create: `packages/ggrd/test/installer-check.mjs`

**Interfaces:**
- Produces: `verifyManifest({ rawManifest, signature, publicKey, platform, arch, clientVersion, protocolVersion })`.
- Produces: `createVersionStore(runtimeDir)` with `stage(version)`, `activate(version)`, `rollback()`, `current()`, `previous()`, and `prune()`.
- Produces: `installArtifact({ manifest, download, extract, versionStore })`.

- [ ] **Step 1: Write failing detached-signature and compatibility tests**

Generate an Ed25519 keypair with `generateKeyPairSync('ed25519')`, sign the exact raw manifest bytes, and assert success. Mutate one byte and assert `SIGNATURE_INVALID`; test wrong digest, platform, architecture, protocol range, and minimum client version errors.

- [ ] **Step 2: Write failing version-store and installer tests**

Use a temporary runtime tree. Assert staging never changes `current`, activation sets `previous` before atomically renaming `current.next`, rollback restores it, partial downloads remain outside `versions/`, and pruning keeps active plus previous.

- [ ] **Step 3: Run the tests and verify they fail**

Run: `node packages/ggrd/test/manifest-check.mjs && node packages/ggrd/test/installer-check.mjs`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement exact-byte signature and stream digest checks**

Verify the detached signature over the raw `manifest.json` bytes before parsing. Stream the artifact through `createHash('sha256')`; compare using `timingSafeEqual`. Reject redirects to non-HTTPS URLs in production, validate database rollback compatibility metadata, and enforce a maximum artifact size from the manifest plus a small framing allowance.

Embed only the Ed25519 public key and fixed HTTPS channel manifest endpoints in `trust-root.mjs`; allow tests to inject replacements. The private signing key must never be present in Electron, `ggrd`, backend artifacts, logs, or repository files.

- [ ] **Step 5: Implement atomic version storage and staging**

Before download, compare manifest size plus extraction allowance with available disk space. Create temporary directories under `runtime/.staging`, resume only when the server validates the saved ETag/Last-Modified value, fsync downloaded files, extract without accepting absolute paths or `..` segments, validate `bin/node` and `app/server.mjs`, then rename into `versions/<version>`. Use sibling symlinks plus `rename()` for activation.

- [ ] **Step 6: Run supervisor storage tests**

Run: `node packages/ggrd/test/manifest-check.mjs && node packages/ggrd/test/installer-check.mjs`

Expected: both checks pass and leave no temporary files.

- [ ] **Step 7: Commit**

```bash
git add packages/ggrd
git commit -m "feat: add signed backend version installer"
```

### Task 11: Implement supervisor API, health gating, and crash-loop rollback

**Files:**
- Create: `packages/ggrd/server.mjs`
- Create: `packages/ggrd/lib/rpc-server.mjs`
- Create: `packages/ggrd/lib/backend-process.mjs`
- Create: `packages/ggrd/lib/supervisor-api.mjs`
- Create: `packages/ggrd/test/backend-process-check.mjs`
- Create: `packages/ggrd/test/supervisor-api-check.mjs`
- Modify: `packages/ggrd/package.json`

**Interfaces:**
- Consumes: version store and installer from Task 10 plus protocol envelopes from Task 1; `ggrd` must not import `ggr-backend`.
- Produces supervisor methods: `supervisor.status`, `update.check`, `update.install`, `update.rollback`, `supervisor.repair`, and `diagnostics.tail`.
- Produces: `createBackendProcessManager({ versionStore, spawnProcess, healthCheck, now, crashPolicy })`.

- [ ] **Step 1: Write failing candidate health and rollback tests**

Assert a candidate is launched as `<version>/bin/node <version>/app/server.mjs`, receives only supervisor-selected environment/path values, and must pass `system.health` within the deadline. Assert failed readiness restores the previous symlink and restarts it.

- [ ] **Step 2: Write failing crash-loop tests**

Configure three exits in 60 seconds. Assert exactly one automatic rollback, one diagnostic record, and no oscillation back to the failed version. Assert a user-requested stop does not count as a crash.

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `node packages/ggrd/test/backend-process-check.mjs && node packages/ggrd/test/supervisor-api-check.mjs`

Expected: FAIL because process manager and API modules do not exist.

- [ ] **Step 4: Implement process management and safe update coordination**

Before activation call `task.list`; if tasks are active, ask the backend to enter update-drain mode so no new task starts, then wait up to the request deadline for active tasks to reach their declared safe exit points. Return `TASKS_ACTIVE` with task summaries after the deadline unless the request explicitly sets `cancelRunningTasks: true`. Stop the active backend gracefully, activate, start the candidate, and health-check it. Roll back on spawn, handshake, migration, or readiness failure.

- [ ] **Step 5: Implement the private supervisor socket API**

Implement `ggrd/lib/rpc-server.mjs` as a supervisor-owned JSONL socket adapter using the protocol envelopes; do not import or reuse backend handlers. Use `~/.geekgeekrun/run/supervisor.sock` mode `0600`. Serialize concurrent installs with one lock and return current, previous, candidate, progress, last failure, and rollback status from `supervisor.status`. Write rotating, mode-`0600` JSONL diagnostics with operation correlation IDs and the same recursive secret redaction rules as the backend.

- [ ] **Step 6: Run all `ggrd` tests**

Run: `pnpm --filter @geekgeekrun/ggrd test`

Expected: manifest, installer, process, and API checks all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ggrd pnpm-lock.yaml
git commit -m "feat: supervise and rollback ggr backend"
```

### Task 12: Build self-contained backend artifacts and release workflow

**Files:**
- Create: `scripts/build-ggr-backend-artifact.mjs`
- Create: `scripts/sign-ggr-backend-manifest.mjs`
- Create: `packages/ggr-backend/artifact-layout.json`
- Create: `.github/workflows/release-ggr-backend.yml`
- Create: `packages/ggr-backend/test/artifact-check.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: backend entry from Task 3 and manifest schema from Task 10.
- Produces: `dist/ggr-backend/<version>/ggr-backend-<version>-darwin-<arch>.tar.gz`, `manifest.json`, and `manifest.sig`.

- [ ] **Step 1: Write a failing artifact layout test**

Build into a temp directory and assert the archive contains:

```text
bin/node
app/server.mjs
app/package.json
app/node_modules/better-sqlite3/
app/node_modules/puppeteer/
metadata/build.json
```

Extract it, run `bin/node app/server.mjs` with temporary runtime paths, connect, and assert `system.health` returns the artifact version.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node packages/ggr-backend/test/artifact-check.mjs`

Expected: FAIL because the build script does not exist.

- [ ] **Step 3: Implement the deterministic artifact builder**

Use `pnpm --filter @geekgeekrun/ggr-backend deploy --prod <staging>/app`, copy the Node 20.16.0 macOS binary into `<staging>/bin/node`, write build metadata, strip caches/tests, and create a sorted gzip archive with normalized timestamps. Refuse to build when `process.version` is not `v20.16.0`.

- [ ] **Step 4: Implement manifest creation and detached signing**

Read signing material only from `GGR_UPDATE_PRIVATE_KEY`; never log it. Write the final raw manifest once, sign those exact bytes with Ed25519, and write the Base64 signature separately. Include all compatibility fields from Global Constraints.

- [ ] **Step 5: Add the backend-only release workflow**

Trigger on `workflow_dispatch` with version and channel inputs. Install pnpm 10.33.2 and Node 20.16.0, run all backend/protocol/supervisor tests, build arm64 and x64 artifacts on matching macOS runners, codesign binaries using `GGR_SIGNING_IDENTITY`, notarize with `xcrun notarytool`, sign the manifest, and publish all files to one versioned release.

- [ ] **Step 6: Run local artifact verification**

Run: `pnpm build:ggr-backend-artifact -- --version 0.1.0-dev --unsigned-test && node packages/ggr-backend/test/artifact-check.mjs`

Expected: health check passes from the extracted artifact; production mode refuses `--unsigned-test`.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts packages/ggr-backend .github/workflows/release-ggr-backend.yml pnpm-lock.yaml
git commit -m "build: publish standalone ggr backend artifacts"
```

### Task 13: Install `ggrd` with `launchd` and add Electron one-click updates

**Files:**
- Create: `packages/ggrd/lib/launchd.mjs`
- Create: `packages/ggrd/test/launchd-check.mjs`
- Create: `scripts/build-ggrd-bootstrap.mjs`
- Create: `packages/ui/src/main/backend/supervisor-client.ts`
- Create: `packages/ui/src/main/backend/bootstrap.ts`
- Create: `packages/ui/src/renderer/src/components/BackendUpdatePanel.vue`
- Modify: `packages/ui/src/main/index.ts`
- Modify: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`
- Modify: `packages/ui/electron-builder.yml`
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/test/backend-boundary-check.mjs`

**Interfaces:**
- Consumes: supervisor API from Task 11 and backend artifacts from Task 12.
- Produces: `ensureSupervisorInstalled()`, `ensureBackendReady()`, and renderer IPC channels `backend-update-status`, `backend-update-check`, `backend-update-install`, and `backend-update-rollback`.

- [ ] **Step 1: Write failing LaunchAgent generation tests**

Assert the generated plist label is `com.geekgeekrun.ggrd`, program arguments use the copied user-scoped bootstrap under `~/.geekgeekrun/supervisor/`, stdout/stderr go to private log files, and no shell interpolation is used. Test commands through an injected `runLaunchctl` function.

- [ ] **Step 2: Write failing Electron bootstrap boundary tests**

Assert production startup calls `ensureSupervisorInstalled()` then `ensureBackendReady()`, development startup connects to `GGR_BACKEND_SOCKET` without installing artifacts, and the Electron builder includes `ggrd-bootstrap` but excludes backend packages/native dependencies.

- [ ] **Step 3: Run tests and verify they fail**

Run: `node packages/ggrd/test/launchd-check.mjs && node packages/ui/test/backend-boundary-check.mjs`

Expected: FAIL because launchd and bootstrap modules do not exist.

- [ ] **Step 4: Implement user-scoped supervisor installation**

Build the stable bootstrap as a bundled `ggrd/server.mjs` plus a pinned Node runtime. Electron copies it atomically to `~/.geekgeekrun/supervisor/<bootstrap-version>/`, writes `~/Library/LaunchAgents/com.geekgeekrun.ggrd.plist`, then calls `launchctl bootstrap gui/<uid>` or `launchctl kickstart -k` through argument arrays.

- [ ] **Step 5: Implement first-run and development bootstrap**

Production connects to `supervisor.sock`; if no backend is installed it asks `ggrd` to install the stable release, waits for readiness, then opens the main window. Pass an explicitly user-configured HTTPS proxy to `ggrd` without returning proxy credentials to the renderer, and expose retry plus redacted diagnostics when download fails. Development uses the source backend socket and surfaces a clear error containing `pnpm dev:backend` when unavailable.

- [ ] **Step 6: Add one-click update UI and IPC**

Display installed/available versions, download/verification/activation progress, compatibility errors, active-task blocking, last rollback reason, retry, and rollback. The renderer never receives artifact URLs, signatures, or filesystem paths; it invokes supervisor operations through Electron main.

- [ ] **Step 7: Run typechecks and bootstrap tests**

Run: `pnpm --filter @geekgeekrun/ggrd test && node packages/ui/test/backend-boundary-check.mjs && pnpm --filter geekgeekrun-ui typecheck`

Expected: all pass; a temp-home integration test installs the bootstrap and backend without touching the real LaunchAgents directory.

- [ ] **Step 8: Commit**

```bash
git add packages/ggrd packages/ui scripts/build-ggrd-bootstrap.mjs pnpm-lock.yaml
git commit -m "feat: add backend first-run and one-click updates"
```

### Task 14: Remove packaging coupling and verify end-to-end upgrade/rollback

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/electron-builder.yml`
- Modify: `packages/ui/electron.vite.config.ts`
- Delete: `packages/ui/scripts/run-build-sqlite-plugin.mjs`
- Delete: `packages/ui/scripts/steps/build-sqlite-plugin.mjs`
- Delete: `packages/pm/`
- Delete: `packages/run-core-of-geek-auto-start-chat-with-boss/` after worker parity is proven
- Create: `test/e2e/backend-decoupling-check.mjs`
- Modify: `package.json`
- Modify: `README.md` only after preserving and integrating the user's existing changes

**Interfaces:**
- Consumes: all prior tasks.
- Produces: the final release boundary and an end-to-end proof that Electron remains unchanged across backend updates.

- [ ] **Step 1: Write the failing end-to-end decoupling check**

The test must:

1. start a temporary supervisor with backend artifact `1.0.0`;
2. connect fake Electron and MCP clients simultaneously;
3. run config, record, and task status requests;
4. install `1.0.1` without rebuilding either client;
5. verify both reconnect and report `1.0.1`;
6. install a deliberately unhealthy `1.0.2`;
7. verify automatic rollback to `1.0.1` and unchanged data.

- [ ] **Step 2: Run it and verify it fails before cleanup**

Run: `node test/e2e/backend-decoupling-check.mjs`

Expected: FAIL while Electron still contains backend dependencies/build hooks.

- [ ] **Step 3: Remove Electron backend dependencies and build hooks**

Remove `@geekgeekrun/pm`, `@geekgeekrun/sqlite-plugin`, Puppeteer, backend automation packages, and SQLite prebuild scripts from the UI package. Keep only protocol/client/supervisor bootstrap dependencies required by Electron. Ensure builder resources include `ggrd-bootstrap` and no `ggr-backend` artifact.

- [ ] **Step 4: Delete obsolete process packages and static checks**

Delete `packages/pm` and the legacy run-core package only after `rg` and tests prove no callers remain. Update UI static checks to assert the new boundaries rather than the old daemon implementation details.

- [ ] **Step 5: Update documentation without losing user edits**

Re-read the current modified `README.md`, merge a short development section containing `pnpm dev:backend` plus `pnpm --filter geekgeekrun-ui dev`, and document that backend releases are independent. Do not stage unrelated README hunks.

- [ ] **Step 6: Run full verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm test:ggr-protocol
pnpm test:ggr-backend
pnpm --filter @geekgeekrun/ggrd test
pnpm --filter geekgeekrun-ui typecheck
node test/e2e/backend-decoupling-check.mjs
pnpm --filter geekgeekrun-ui build
```

Expected: all commands pass. `rg -n "@geekgeekrun/(pm|sqlite-plugin|geek-auto-start-chat-with-boss)|puppeteer|better-sqlite3" packages/ui/src packages/ui/package.json packages/ui/electron-builder.yml` returns no backend packaging/import matches.

- [ ] **Step 7: Inspect the unpacked Electron artifact**

Run: `pnpm --filter geekgeekrun-ui build:unpack` and inspect `packages/ui/dist/*-unpacked/resources`.

Expected: it contains the stable `ggrd` bootstrap and protocol/UI assets; it does not contain backend worker sources, SQLite native bindings, Puppeteer, Chromium, or a versioned backend artifact.

- [ ] **Step 8: Commit**

```bash
git add package.json packages/ui packages/pm packages/run-core-of-geek-auto-start-chat-with-boss test/e2e pnpm-lock.yaml
git add -p README.md
git commit -m "refactor: complete backend electron release split"
```

---

## Final Release Gate

Before publishing the first decoupled release:

- Install on a clean Apple Silicon macOS user account.
- Upgrade an existing coupled installation with real copied user data.
- Confirm Electron exit leaves backend tasks running.
- Confirm Electron and `ggr-mcp` can connect concurrently.
- Confirm a backend-only `1.0.0` to `1.0.1` update leaves the Electron application hash unchanged.
- Confirm an invalid signature never reaches staging.
- Confirm a failed database rehearsal never modifies the live database.
- Confirm an unhealthy candidate rolls back once and does not oscillate.
- Confirm socket, config, database, cookie, and log permissions are user-private.
- Confirm Apple signing and notarization succeed for the supervisor bootstrap and backend artifacts.
