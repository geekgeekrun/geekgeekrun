# Menubar Controller Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert GeekGeekRun toward a maintainable macOS menubar/headless architecture by removing runtime source patching and adding a minimal Electron Tray entry.

**Architecture:** Keep the existing Electron dashboard and daemon/worker model. Add a small Tray layer in the Electron main process that can show/hide the dashboard and quit the app, while future task actions can reuse the existing daemon controller. Make headless mode a first-class runtime configuration in the Puppeteer core instead of a ggr-mcp source rewrite.

**Tech Stack:** Electron 39, electron-vite, Vue 3 renderer, Node ESM ggr-mcp, Puppeteer core.

## Global Constraints

- Do not change the current pnpm workspace structure.
- Keep the normal dashboard launch path working.
- Avoid runtime modification of repository source files.
- Add only a minimal Tray foundation first; do not build a full popover UI in this pass.
- Verification commands must be runnable with existing allowlisted tools.

---

### Task 1: Headless Runtime Flag

**Files:**
- Modify: `packages/geek-auto-start-chat-with-boss/index.mjs`
- Modify: `packages/ggr-mcp/lib/agent-service.mjs`
- Modify: `packages/ggr-mcp/test/check.mjs`

**Interfaces:**
- Consumes: `GGR_HEADLESS` environment variable.
- Produces: Puppeteer launch reads `headless: process.env.GGR_HEADLESS === 'true'`.

- [x] **Step 1: Write failing static checks**

```js
assert.match(coreSource, /headless:\s*process\.env\.GGR_HEADLESS\s*===\s*['"]true['"]/, 'core must read headless mode from GGR_HEADLESS')
assert.doesNotMatch(coreSource, /headless:\s*false/, 'core must not hard-code visible browser mode')
assert.doesNotMatch(agentSource, /ensureHeadlessPatch/, 'ggr-mcp must not patch source files at runtime')
```

- [x] **Step 2: Run check and verify failure**

Run: `node packages/ggr-mcp/test/check.mjs`
Expected: FAIL because the core still contains `headless: false` and ggr-mcp still contains `ensureHeadlessPatch`.

- [x] **Step 3: Implement runtime headless flag**

Replace the Puppeteer launch setting with:

```js
headless: process.env.GGR_HEADLESS === 'true',
```

Remove `ensureHeadlessPatch()` from `packages/ggr-mcp/lib/agent-service.mjs` and stop calling it from `start()`.

- [x] **Step 4: Run check and verify pass**

Run: `node packages/ggr-mcp/test/check.mjs`
Expected: PASS with `ggr-mcp check passed`.

### Task 2: Minimal macOS Tray Foundation

**Files:**
- Create: `packages/ui/src/main/features/tray.ts`
- Modify: `packages/ui/src/main/window/mainWindow.ts`
- Modify: `packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts`
- Create: `packages/ui/test/check.mjs`

**Interfaces:**
- Consumes: `showMainWindow()` and `hideMainWindow()` from `mainWindow.ts`.
- Produces: `initTray()` from `features/tray.ts`.

- [x] **Step 1: Write failing static checks**

```js
assert.match(traySource, /import\s+\{[^}]*Tray[^}]*\}\s+from ['"]electron['"]/, 'tray feature must import Electron Tray')
assert.match(traySource, /new\s+Tray\(/, 'tray feature must create a Tray instance')
assert.match(openSettingWindowSource, /initTray\(/, 'setting window flow must initialize the tray')
```

- [x] **Step 2: Run check and verify failure**

Run: `node packages/ui/test/check.mjs`
Expected: FAIL because `packages/ui/src/main/features/tray.ts` does not exist.

- [x] **Step 3: Implement tray module**

Create `initTray()` that creates one `Tray`, sets a tooltip, and adds menu items: open dashboard, hide dashboard, quit.

- [x] **Step 4: Wire tray into setting window flow**

Call `initTray()` after `app.whenReady()` in `OPEN_SETTING_WINDOW/index.ts`.

- [x] **Step 5: Run check and verify pass**

Run: `node packages/ui/test/check.mjs`
Expected: PASS with `ui static check passed`.
