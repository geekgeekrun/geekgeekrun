# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

**Always use `proto run pnpm -- <args>`** instead of bare `pnpm`. The project requires pnpm `>=8.15.9 <9.0.0`; the system pnpm (10.x) is incompatible and will cause errors.

```bash
proto run pnpm -- install
proto run pnpm -- -F geekgeekrun-ui dev
```

## Key Commands

All UI development happens in `packages/ui`. The `dev`/`build`/`start` scripts automatically rebuild `sqlite-plugin` first.

```bash
# Electron app (main entry point for users)
proto run pnpm -- -F geekgeekrun-ui dev          # development mode
proto run pnpm -- -F geekgeekrun-ui build         # production build
proto run pnpm -- -F geekgeekrun-ui build:win     # Windows installer

# Lint & format (run from packages/ui)
proto run pnpm -- -F geekgeekrun-ui lint          # eslint --fix
proto run pnpm -- -F geekgeekrun-ui format        # prettier --write

# Type checking (run from packages/ui)
proto run pnpm -- -F geekgeekrun-ui typecheck     # both node + web

# SQLite plugin (must build before UI if changed)
proto run pnpm -- -F @geekgeekrun/sqlite-plugin build
proto run pnpm -- -F @geekgeekrun/sqlite-plugin dev   # watch mode
```

## Architecture

This is a **pnpm monorepo** (`packages/*`) — a desktop automation tool for BOSS Zhipin (job platform) built on Electron + Puppeteer.

### Two Sides

**Job-seeker side** (older, more complete):
- `packages/geek-auto-start-chat-with-boss` — core automation: LLM-based resume matching, auto-chat
- `packages/run-core-of-geek-auto-start-chat-with-boss` — headless daemon entry point

**Recruiter side** (newer, under active development):
- `packages/boss-auto-browse-and-chat` — core automation: browse candidates, filter, send greetings, extract resumes via Canvas hook
- `packages/run-core-of-boss-auto-browse` — headless daemon entry point

### Electron App (`packages/ui`)

The app uses **mode-based process routing**: every worker subprocess is actually the same Electron binary launched with a `--mode` flag. `src/main/index.ts` switches on `runMode`:

- No `--mode` (default) → opens the settings GUI window (`OPEN_SETTING_WINDOW`)
- `bossRecommendMain` / `bossChatPageMain` / `bossAutoBrowseAndChatMain` → recruiter workers
- `geekAutoStartWithBossMain` → job-seeker worker
- `launchDaemon` → background daemon process (manages worker subprocesses via `@geekgeekrun/pm`)

The GUI renderer is **Vue 3 + Pinia + Vue Router** served by electron-vite. IPC handlers live in `src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts`.

### Plugin/Hook System

All automation cores (both sides) use **tapable** (`AsyncSeriesHook`, `AsyncSeriesWaterfallHook`) for extensibility. The sqlite-plugin and webhook features attach to these hooks:

```
Worker flow file
  → constructs hooks object
  → new SqlitePlugin(dbPath).apply(hooks)
  → calls core function (startBossAutoBrowse / startBossChatPageProcess / startGeekAutoChat)
```

### Shared Packages

- `packages/sqlite-plugin` — TypeORM + better-sqlite3, compiled TypeScript (`dist/`). Entities: `CandidateInfo`, `CandidateContactLog`, `ChatStartupLog`. **Must be built before UI.**
- `packages/utils` — ESM utilities: sleep, OpenAI/GPT requests, Puppeteer helpers
- `packages/pm` — Electron multi-process daemon/worker management
- `packages/laodeng` / `packages/puppeteer-extra-plugin-laodeng` — anti-bot-detection Puppeteer plugin

### Storage Layout

```
~/.geekgeekrun/
  config/
    boss-recruiter.json       # recruiter automation config
    candidate-filter.json     # candidate filter criteria
    webhook.json              # webhook integration config
  storage/
    boss-cookies.json         # persisted BOSS Zhipin cookies
    boss-local-storage.json   # persisted localStorage
    public.db                 # SQLite database
```

### Recruiter Automation Stack (boss-auto-browse-and-chat)

Key files and their roles:
- `index.mjs` — `startBossAutoBrowse()`: browser launch, login, main loop
- `candidate-processor.mjs` — DOM parsing (`#recommend-list > div > ul > li`), candidate filtering
- `chat-handler.mjs` — clicking 打招呼 (`button.btn-greet`), handling popup (`button.btn-sure-v2`), processCandidate
- `resume-extractor.mjs` — network intercept + iframe Canvas fillText hook (MutationObserver pattern, see `plan/cv_canvas_solution.md`)
- `constant.mjs` — all CSS selectors and URLs; **update here first when BOSS site HTML changes**

Anti-detection: stealth + laodeng + anonymize-ua plugins; all clicks via `ghost-cursor` (`createHumanCursor`); random delays via `sleepWithRandomDelay`.

## Code Style

Enforced by eslint + prettier in `packages/ui`:
- **No semicolons**, **single quotes**, `printWidth: 100`, no trailing commas
- Vue 3 `<script setup>` SFC style
- `.mjs` files (automation core) are plain ESM, no TypeScript, no build step

## Plan Documents

`plan/` contains architecture decision documents intended for AI-assisted development:
- `recruiter_architecture.md` — high-level overview of the recruiter side
- `recommend_page_flow.md` — detailed DOM structure, selectors, and flow for the recommend page
- `cv_canvas_solution.md` — how BOSS Zhipin's WASM+Canvas resume protection works and how it's bypassed
