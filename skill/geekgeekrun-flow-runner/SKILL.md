---
name: "geekgeekrun-flow-runner"
description: "Manage GeekGeekRun auto-chat by calling the repo's PowerShell wrappers. Use this when OpenClaw needs to start, stop, inspect, or summarize auto-chat without directly driving Electron or Puppeteer."
---

# GeekGeekRun Flow Runner

Use this skill as a thin orchestration layer over the repo scripts in `skill/geekgeekrun-flow-runner`. Do not click the UI or automate browser actions from the skill. Only call the scripts and interpret their JSON output.

## Available Flow

- `auto-chat`: `geekAutoStartWithBoss`

## Script Root

Use repo-relative script paths when invoking PowerShell:

```powershell
$GGR_SCRIPTS = ".\skill\geekgeekrun-flow-runner\scripts"
```

The scripts resolve the repo root from their own location. Do not hardcode a machine-specific repo path.

## Core Commands

Check one flow before acting:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\status-flow.ps1" -Flow auto-chat
```

For `auto-chat`, `status-flow.ps1` can also return `startupReady` from the repo runtime:

- `startupReady.status = pending` means the worker started but the recommend page is not confirmed ready yet
- `startupReady.status = fulfilled` means the recommend page is ready for real job scanning
- `startupReady.status = rejected` means startup reached a known blocking error before the recommend page became ready

Start auto-chat:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\start-auto-chat.ps1"
```

Stop one flow:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\stop-flow.ps1" -Flow auto-chat
```

`stop-flow.ps1` now returns JSON that can include:

- `runRecordId`
- `runSummary.viewedJobs`
- `runSummary.greetedJobs`

Important:

- `stop-flow.ps1` inline `runSummary` is best-effort.
- If `runRecordId` exists, OpenClaw should immediately run a second query with `get-run-stop-summary.py` and use that result as the authoritative shutdown summary.
- Do not treat inline `runSummary` as sufficient by itself when `runRecordId` is available.

Authoritative follow-up query:

```powershell
python ".\skill\geekgeekrun-flow-runner\scripts\get-run-stop-summary.py" --flow auto-chat --run-record-id "<runRecordId>"
```

## Auto-Chat Rules

`start-auto-chat.ps1` now has a repo-managed default profile strategy. If no arguments are passed, it reads:

- `skill/geekgeekrun-flow-runner/defaults/auto-chat.json`

The default scheme is:

- fixed `userDataDir`
- `sessionInjectionMode = none`

Use plain startup first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\start-auto-chat.ps1"
```

If auto-chat needs a temporary override, pass `-UserDataDir`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\start-auto-chat.ps1" -UserDataDir ".\.runtime\user-data\auto-chat"
```

When `-UserDataDir` is provided and `-SessionInjectionMode` is omitted, the script defaults to `none`. Keep that default unless you are intentionally running a session-injection experiment.

If the user previously completed manual login in a fixed `userDataDir`, restart auto-chat with the same `userDataDir`.

## Optional Config Patch

Start scripts accept either `-ConfigPatchJson` or `-ConfigPatchFile`. They patch `C:\Users\<your-user>\.geekgeekrun\config\boss.json` before launch.

Example:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\start-auto-chat.ps1" -ConfigPatchJson '{"expectSalaryLow":9,"expectSalaryHigh":20}'
```

## Current-Branch Tuning

When tuning `auto-chat` on the current feature branch, these knobs are enforced by the runtime:

- `jobSourceList.search.children`
- `expectJobNameRegExpStr`
- `expectJobTypeRegExpStr`
- `expectJobDescRegExpStr`
- `jobDetailRegExpMatchLogic`
- `expectCityList`
- `expectWorkExpList`
- `expectSalaryLow` / `expectSalaryHigh`
- `blockCompanyNameRegExpStr`
- `markAsNotActiveSelectedTimeRange`
- `combineRecommendJobFilterType`
- `staticCombineRecommendJobFilterConditions`
- `fieldsForUseCommonConfig`
- `combinedMatching`
- `searchSourceRequireTechStack`
- `searchSourceTechStackRegExpStr`
- `searchKeywordDegradation`
- `reliabilityProtection`

For targeted search-mode runs, narrow the search keywords first and then tighten the three job-detail regex fields. Prefer backend-leaning titles over broad AI terms so the search result set does not drift into product, support, ops, or pure algorithm roles. If search quality still drifts, use `combinedMatching`, `searchSourceRequireTechStack`, and `searchKeywordDegradation` together instead of relying on title regex alone.

Targeted search patch example:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\skill\geekgeekrun-flow-runner\scripts\start-auto-chat.ps1" -ConfigPatchFile ".\skill\geekgeekrun-flow-runner\defaults\auto-chat-search-targeted.json"
```

## Expected OpenClaw Flow

1. Call `status-flow.ps1` for `auto-chat`.
2. If another managed flow is running, stop `auto-chat` first with `stop-flow.ps1`.
3. Start auto-chat.
4. Read the returned JSON and report `success`, `pid`, `flow`, and any user-data/session settings.
5. On shutdown or mode switch, stop the active flow explicitly.
