# Hermes Job Agent MCP Design

## Purpose

Turn GeekGeekRun from a UI-first BOSS automation app into a tool-first local service that Hermes can call through MCP. The first deliverable is intentionally small: expose start, stop, status, and config update tools while preserving the existing Puppeteer automation core.

## Current repository facts

- The root `start` script already runs `packages/run-core-of-geek-auto-start-chat-with-boss/daemon-main.mjs`, so the automation core can be launched without an Electron control surface.
- The workspace uses `packages/*`, so the MCP integration should live as a separate package instead of being mixed into the automation package.
- Runtime state already lives under `~/.geekgeekrun`, with config files in `~/.geekgeekrun/config` and storage files in `~/.geekgeekrun/storage`.
- The current Puppeteer launch path hard-codes `headless: false`; V0 adds a runtime patcher so the MCP server can make the local checkout respect `GGR_HEADLESS=true` without rewriting the large core file through GitHub.

## Product shape

Hermes is the brain. GeekGeekRun remains the hand and eyes. The MCP server is the adapter between them. A future macOS menu bar app can observe the same service state, but it should not own the automation logic.

```text
Hermes
  |
  | MCP stdio
  v
@geekgeekrun/mcp-server
  |
  | child process + runtime config
  v
packages/run-core-of-geek-auto-start-chat-with-boss/daemon-main.mjs
  |
  v
Puppeteer / Chromium / BOSS
```

## V0 scope

V0 implements these MCP tools:

1. `boss_start_agent`
   - Starts the existing daemon in a child process.
   - Accepts `headless`, `mode`, and optional config patch fields.
   - Applies the headless patch before starting.

2. `boss_stop_agent`
   - Stops the child process if it is running.
   - Sends `SIGTERM` first, then the process can be restarted later.

3. `boss_get_status`
   - Returns process status, runtime flags, recent output, and the last error.

4. `boss_update_config`
   - Writes JSON patches into files under `~/.geekgeekrun/config`.
   - Supports `boss.json`, `common-job-condition-config.json`, `target-company-list.json`, `llm.json`, and `dingtalk.json`.

## Safety constraints

- Default mode is `semi_auto`, not fully autonomous messaging.
- The MCP server does not send HR messages in V0.
- The server exposes process control and configuration only.
- The BOSS account should be treated as sensitive; cookies remain in the existing local storage path and are never returned by MCP tools.
- Future `send_message` tools must require explicit confirmation by default.

## Implementation boundaries

### `packages/geekgeekrun-mcp-server/server.mjs`

Owns the MCP stdio server and tool registration.

### `packages/geekgeekrun-mcp-server/lib/mcp-stdio.mjs`

Implements a small dependency-free MCP JSON-RPC stdio transport using `Content-Length` framing.

### `packages/geekgeekrun-mcp-server/lib/agent-service.mjs`

Owns process lifecycle, status, config writes, and the local source patch for `GGR_HEADLESS`.

### `packages/geekgeekrun-mcp-server/test/smoke.mjs`

Runs a dependency-free smoke test for the service status and config validation path.

## Future V1

- Add `boss_get_recent_chats` from SQLite/hook logs.
- Add structured event logs for dashboard consumption.
- Add a local HTTP endpoint for macOS tray/dashboard status.
- Move the headless patch from runtime patcher into the core file directly once a normal git working tree is available.

## Future V2

- Add chat CRM entities: sessions, messages, follow-up state, HR intent score.
- Add semi-automatic reply drafting.
- Add explicit human approval before sending messages.
- Add macOS menu bar app as a status and review surface.
