# Task 5C session compatibility

## Completed

- `readSession()` migrates valid cookie-only legacy storage into the authoritative paired session exactly once when `boss-session.json` is absent.
- Invalid legacy cookies do not create an authoritative session.
- Explicit authoritative invalidation is a tombstone, preventing stale legacy mirrors from recreating a valid backend session.
- Manual Cookie Assistant saves use `save-boss-session` in Electron main and the backend compatibility API, preserving an existing paired local-storage value when no new value is supplied.
- Cookie invalidation uses the same backend compatibility API and clears the authoritative session before compatibility mirrors.

## Regression coverage

- Legacy cookie-only migration and invalid-cookie rejection.
- Manual session save restored by `openBoss` with preserved paired local storage.
- Invalidation rejects both `openBoss` and the read-no-reply authoritative session reader.

## Verification

Using Node `v24.14.0`:

- `node packages/ggr-backend/test/browser-service-check.mjs` — passed
- `node packages/ggr-backend/test/read-no-reply-worker-check.mjs` — passed
- `node packages/ui/test/check.mjs` — passed
- `git diff --check` — passed

`pnpm --filter geekgeekrun-ui typecheck` remains red on pre-existing project-wide TypeScript diagnostics. The two unused `@ts-expect-error` diagnostics associated with these touched imports were removed; the focused Node 24 checks above pass.
