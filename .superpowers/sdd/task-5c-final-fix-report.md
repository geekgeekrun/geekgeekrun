# Task 5C final-fix report

## Corrections

- The fd3 compatibility bridge now buffers UTF-8 chunks and accepts the legacy bare `JSON.stringify(payload)` write without a newline, while keeping newline-delimited JSON compatibility.
- A spawned Node fd3 harness sends a split bare `NEW_WINDOW` message, verifies Boss readiness and routing, and exercises early-exit and readiness-timeout cleanup. The parent closes fd3, waits for `SIGTERM`, escalates to `SIGKILL` if needed, and asserts that no child remains alive.
- Read-no-reply now obtains cookies and local storage from one `createBrowserStorage(...).readSession()` snapshot. Its concurrent-generation regression proves the worker cannot read mixed mirror halves.
- The Boss IPC and cookie-assistant UI callers now use the backend-owned `createBrowserCompatibilityApi`; they retain ready, cookie, new-window, failure, timeout, and cleanup handling without injecting `PUPPETEER_EXECUTABLE_PATH` or spawning `--mode` Electron children.
- Browser cancellation, executable-history discovery, and backend browser cleanup remain covered by the focused browser and server checks.

## Verification

Run with Node `v24.14.0`:

```text
node --test packages/ggr-backend/test/browser-service-check.mjs packages/ggr-backend/test/read-no-reply-worker-check.mjs packages/ggr-backend/test/server-check.mjs
node packages/ggr-protocol/test/check.mjs
node packages/ui/test/check.mjs
git diff --check
```

All commands passed. The browser harness completed in under two seconds and the post-run process scan found no harness or browser-service child.
