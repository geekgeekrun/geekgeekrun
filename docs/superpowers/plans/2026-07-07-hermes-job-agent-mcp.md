# Hermes Job Agent MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free MCP server that lets Hermes start, stop, inspect, and configure the existing GeekGeekRun BOSS automation daemon.

**Architecture:** Add a new workspace package, `packages/geekgeekrun-mcp-server`, that exposes MCP over stdio and controls the existing daemon as a child process. The MCP package owns JSON-RPC framing, tool dispatch, status tracking, config patching, and a local source patch that makes the existing Puppeteer launch respect `GGR_HEADLESS=true`.

**Tech Stack:** Node.js 20 ESM, pnpm workspace, dependency-free MCP stdio, existing GeekGeekRun daemon, existing `~/.geekgeekrun` runtime files.

## Global Constraints

- Do not add external runtime dependencies for V0.
- Do not expose cookies or localStorage contents through MCP responses.
- Do not add a send-message tool in V0.
- Default tool mode is `semi_auto`.
- The existing daemon remains the automation entrypoint.
- `headless` is supported by a local runtime patcher until the large core file can be edited through a normal git checkout.

---

### Task 1: Add dependency-free MCP stdio transport

**Files:**
- Create: `packages/geekgeekrun-mcp-server/lib/mcp-stdio.mjs`

**Interfaces:**
- Produces: `createMcpServer({ name, version, tools }): { start(): void }`
- Tool shape: `{ name: string, description: string, inputSchema: object, handler(args: object): Promise<object> | object }`

- [ ] **Step 1: Create the stdio transport file**

Create `packages/geekgeekrun-mcp-server/lib/mcp-stdio.mjs` with a `Content-Length` framed JSON-RPC server. It must handle `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, and return JSON-RPC errors for unknown methods or tools.

- [ ] **Step 2: Verify manually**

Run the MCP server after Task 3 with a framed `initialize` request. Expected: response includes `capabilities.tools` and `serverInfo.name`.

---

### Task 2: Add agent process service

**Files:**
- Create: `packages/geekgeekrun-mcp-server/lib/agent-service.mjs`

**Interfaces:**
- Produces: `createAgentService({ repoRoot?: string }): AgentService`
- `AgentService.start(options): Promise<Status>`
- `AgentService.stop(): Promise<Status>`
- `AgentService.getStatus(): Status`
- `AgentService.updateConfig(patch): Promise<object>`
- `AgentService.ensureHeadlessPatch(): Promise<object>`

- [ ] **Step 1: Implement process lifecycle**

Create a singleton-style service that spawns `node packages/run-core-of-geek-auto-start-chat-with-boss/daemon-main.mjs`, tracks PID, start time, exit code, recent stdout/stderr lines, and can stop the child process.

- [ ] **Step 2: Implement config patching**

Write only to these config files under `~/.geekgeekrun/config`: `boss.json`, `common-job-condition-config.json`, `target-company-list.json`, `llm.json`, `dingtalk.json`. Merge object patches into object JSON files and replace array files with arrays.

- [ ] **Step 3: Implement headless source patch**

Patch `packages/geek-auto-start-chat-with-boss/index.mjs` locally by replacing `headless: false` with `headless: process.env.GGR_HEADLESS === 'true'`. Return whether the patch was already present or newly applied.

---

### Task 3: Register MCP tools

**Files:**
- Create: `packages/geekgeekrun-mcp-server/server.mjs`
- Create: `packages/geekgeekrun-mcp-server/package.json`

**Interfaces:**
- Consumes: `createMcpServer` from Task 1
- Consumes: `createAgentService` from Task 2
- Produces MCP tools: `boss_start_agent`, `boss_stop_agent`, `boss_get_status`, `boss_update_config`

- [ ] **Step 1: Create package manifest**

Create a private workspace package with `start` and `test` scripts.

- [ ] **Step 2: Create server entrypoint**

Register the four V0 tools. `boss_start_agent` accepts `headless`, `mode`, and optional `configPatch`. `boss_update_config` accepts `fileName` and `patch`.

---

### Task 4: Add smoke test

**Files:**
- Create: `packages/geekgeekrun-mcp-server/test/smoke.mjs`

**Interfaces:**
- Consumes: `createAgentService`

- [ ] **Step 1: Test initial status**

Assert a fresh service reports `running: false` and `pid: null`.

- [ ] **Step 2: Test config guard**

Assert `updateConfig({ fileName: 'secrets.json', patch: {} })` throws an error containing `Unsupported config file`.

---

### Task 5: Wire root scripts

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces root scripts:
  - `start:mcp`: `node ./packages/geekgeekrun-mcp-server/server.mjs`
  - `test:mcp`: `node ./packages/geekgeekrun-mcp-server/test/smoke.mjs`

- [ ] **Step 1: Add scripts**

Keep the existing `start` script and add MCP scripts.

- [ ] **Step 2: Verify locally**

Run `pnpm test:mcp`. Expected: `geekgeekrun-mcp-server smoke tests passed`.

---

## Self-review

- Spec coverage: V0 start, stop, status, config update, dependency-free MCP, and headless runtime patch are covered.
- Placeholder scan: no implementation task depends on an undefined future feature.
- Type consistency: service methods and server tool names match across tasks.
