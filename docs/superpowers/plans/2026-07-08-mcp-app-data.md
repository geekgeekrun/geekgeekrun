# MCP App Data Implementation Plan

## Goal
Expose user-level GeekGeekRun application data to Hermes through MCP while preserving the permission boundary: Hermes is a delegated user, not root and not worker.

## Files
- `packages/ggr-controller/index.mjs`: add resource enum mapping, read/update app data, redaction helpers.
- `packages/ggr-mcp/lib/agent-service.mjs`: expose controller app-data methods through service.
- `packages/ggr-mcp/server.mjs`: add MCP tools `boss_read_app_data` and `boss_update_app_data`.
- `packages/ggr-controller/test/check.mjs`: verify read/update/redaction/resource whitelist.
- `packages/ggr-mcp/test/check.mjs`: verify service and MCP tool exposure, and no worker-only mutation exposure.

## Tasks
1. Write failing controller tests for resource-based app-data read/update and sensitive redaction.
2. Implement controller resource mapping and app-data APIs.
3. Write failing MCP/service tests for the new tools.
4. Implement service wrappers and MCP tool definitions.
5. Run `npm test` and fix regressions.

## Permission Boundary
Hermes can read/write whitelisted app-data resources, approve AI drafts, require human intervention, and start/stop the agent. Hermes cannot read arbitrary paths, access cookies/localStorage/sessionStorage, read cleartext secrets, or mark worker execution outcomes like sent/failed/expired.
