# Task 5C corrective bridge report

## RED

- The backend browser test did not exercise the Electron child-process fd3 contract. The replacement compatibility module started backend tasks but never emitted `SUB_PROCESS_OF_OPEN_BOSS_SITE_READY`, accepted `NEW_WINDOW`, or forwarded `BOSS_ZHIPIN_COOKIE_COLLECTED`; existing UI callers could wait indefinitely.
- Boss restoration independently read cookies and local storage, permitting a mixed-generation session restore.
- Backend runtime launch options ignored backend executable discovery/history, and the protocol had no `browser.cancel` route.
- The UI dependency entry contained Electron, fd3, download timeout, analytics, and process-exit orchestration instead of delegating to the backend.

## GREEN

- Added a Node-only backend compatibility bridge that owns the legacy fd3 protocol while delegating all browser behavior to `createBrowserService`: cookie notification, Boss ready/closed/failure events, and `NEW_WINDOW` routing are covered by `browser-service-check.mjs`.
- Boss restoration now consumes one authoritative `readSession()` snapshot. The test rejects any fallback split reads.
- Runtime obtains a validated executable through `createDefaultBrowserDependencies` and passes `executablePath` into Puppeteer launch; present and missing-path behavior are tested.
- Added `browser.cancel` to the protocol and server validation, plus browser-service cancellation coverage.
- Replaced the UI dependency entry with a one-line backend compatibility export. Download reporting remains backend-owned and Node-only.
- Boss direct-entry IPC now rejects/cleans up on bridge failure, early child exit, or a 15-second readiness timeout.

## Verification

- `node --test packages/ggr-backend/test/browser-service-check.mjs packages/ggr-backend/test/server-check.mjs`
- `npm test`
- `npm run test:ggr-protocol`
- `npm run test:ggr-backend`
- `git diff --check`

`node --test packages/ggr-backend/test/*.mjs` additionally passed 7/9 checks. The unrelated records and migration checks cannot load the local `better-sqlite3` native binary because it was built for Node ABI 137 while this environment uses ABI 141 (`ERR_DLOPEN_FAILED`). UI node typecheck likewise has pre-existing project errors; none point to this change.
