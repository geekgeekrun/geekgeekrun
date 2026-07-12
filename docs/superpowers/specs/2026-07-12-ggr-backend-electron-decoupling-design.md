# GGR Backend and Electron Decoupling Design

**Date:** 2026-07-12

**Status:** Approved for implementation planning

**Initial platform:** macOS, with cross-platform process and path abstractions

## Summary

GeekGeekRun will separate its automation backend from the Electron application. Electron becomes a stable, optional UI client; `ggr-mcp` and a future CLI become peer clients. A small supervisor named `ggrd` manages an independently versioned backend runtime, including installation, lifecycle, health checks, upgrades, and rollback.

Backend releases will no longer require rebuilding or redistributing the Electron application.

## Motivation

The current Electron executable is both a desktop application and a backend runtime. It launches daemon, worker, browser, login, dependency-download, and reminder modes through command-line flags. Electron main and renderer code also import backend configuration, automation logic, SQLite entities, and native database dependencies directly.

This creates several release-time couplings:

- routine backend changes require rebuilding the Electron package;
- Electron packaging includes backend and native runtime dependencies;
- the UI can read backend files and databases outside a stable API boundary;
- `ggr-mcp`, Electron, and other callers do not share one service interface;
- backend lifecycle is tied to an executable whose primary responsibility should be the UI.

## Goals

- Allow frequent backend updates without rebuilding Electron.
- Keep the backend running after Electron exits.
- Let Electron, `ggr-mcp`, and CLI clients use the same local protocol.
- Support one-click, versioned backend updates from Electron.
- Provide atomic activation, health checks, and automatic rollback.
- Make the backend the sole owner of its database, configuration, secrets, and automation runtime.
- Support macOS first while keeping transport, path, and process APIs portable.

## Non-goals

- Remote or LAN access to the backend.
- Rewriting the existing automation business logic during extraction.
- Shipping the initial implementation for Windows or Linux.
- Replacing SQLite or redesigning all persisted configuration at once.
- Allowing arbitrary third-party clients without a future authorization design.

## Architecture

The system is divided into four components.

### Electron UI

Electron owns windows, presentation, user interaction, update prompts, and local client state. It communicates with the backend and supervisor through typed protocol clients.

Electron must not:

- open the backend SQLite database;
- read or write backend configuration files directly;
- import database entities, Puppeteer types, automation implementations, or backend-only constants;
- execute daemon or worker business modes through its own executable;
- contain backend native modules or backend build steps.

### `ggr-backend`

The backend owns all business and runtime behavior:

- automation task execution;
- Boss browser and login flows;
- database access and migrations;
- durable configuration and secrets;
- reminders, records, and task state;
- public request handling and event publication.

It is built and published independently for each supported OS and CPU architecture.

### `ggrd` supervisor

`ggrd` is a small, stable lifecycle component installed for the current user. On macOS it is registered with `launchd` and remains available independently of Electron.

Its responsibilities are limited to:

- installing backend versions;
- starting, stopping, and monitoring the active backend;
- checking artifact signatures and hashes;
- validating platform and protocol compatibility;
- switching versions atomically;
- detecting crash loops and rolling back;
- reporting lifecycle and update diagnostics.

Business logic must not be added to `ggrd`.

### `ggr-protocol`

This package contains only stable wire-level definitions:

- request and response DTOs;
- events;
- error codes;
- handshake and capability types;
- protocol compatibility rules.

It may not depend on backend implementations, database entities, or UI types.

## Process and Transport Model

The initial implementation uses Unix domain sockets on macOS:

- `backend.sock` exposes business requests and events;
- `supervisor.sock` exposes lifecycle, repair, and update operations.

The separation allows Electron to repair or roll back the backend when the business process cannot start. Socket files are accessible only to the current user. The server verifies that local peers belong to the same user where the platform exposes peer credentials.

Windows Named Pipes will implement the same transport interface later. No TCP port is opened.

The default runtime layout is:

```text
~/.geekgeekrun/
├── runtime/
│   ├── versions/
│   │   ├── 1.4.0/
│   │   └── 1.5.0/
│   ├── current -> versions/1.5.0
│   └── previous -> versions/1.4.0
├── run/
│   ├── backend.sock
│   ├── supervisor.sock
│   └── backend.pid
├── data/
│   ├── database.sqlite
│   └── config/
└── logs/
```

The implementation must centralize platform-specific locations instead of spreading literal paths through clients.

## Protocol

The first version retains the repository's local socket and JSON Lines direction. Every request has an ID and exactly one response. Long-running operations return a task ID and publish progress as events.

Example:

```json
{"id":"req-123","method":"task.start","params":{"profileId":"default"}}
{"id":"req-123","result":{"taskId":"task-456"}}
{"event":"task.progress","data":{"taskId":"task-456","status":"running"}}
```

Clients must begin with a handshake containing their identity, client version, and protocol version. The backend returns its version, supported protocol range, capabilities, and current state.

Initial method groups are:

- `system.*`: handshake, health, version, capabilities, and diagnostics;
- `task.*`: start, stop, list, inspect, and observe automation tasks;
- `config.*`: retrieve, validate, and modify backend configuration;
- `account.*`: login, cookie, and account status operations;
- `records.*`: paginated access to chats, reminders, and other records;
- `browser.*`: login and Boss browser workflows.

Supervisor operations use `supervisor.sock`, not the business API. They cover status, available version checks, install, activate, rollback, repair, and diagnostic logs.

Protocol evolution follows additive compatibility:

- new optional fields and methods may be added within a protocol major version;
- existing fields must retain meaning;
- fields or methods cannot be removed until a new protocol major version;
- unknown optional fields and events must be ignored safely;
- every release manifest declares its supported protocol range and minimum client version.

`ggr-mcp` becomes an adapter from MCP tools to this protocol. It must not launch or import the legacy backend directly.

## Packaging and Distribution

Backend artifacts are published by version, platform, and architecture, for example:

```text
ggr-backend-1.5.1-darwin-arm64.tar.zst
ggr-backend-1.5.1-darwin-x64.tar.zst
manifest.json
manifest.sig
```

Each artifact includes a pinned Node runtime, application code, and architecture-specific native dependencies such as `better-sqlite3`. It does not depend on a user-installed Node or npm environment.

Large browser binaries are stored in a shared, content-addressed runtime cache so that they are not duplicated in every backend version.

macOS executables and artifacts must use the project's signing and notarization process. The manifest includes at least:

- backend version;
- platform and architecture;
- artifact URL and size;
- SHA-256 digest;
- signature metadata;
- supported protocol range;
- minimum client version;
- database compatibility metadata;
- release channel.

The Electron package contains the small `ggrd` bootstrap and protocol client, but not `ggr-backend`, SQLite native bindings, Puppeteer, or automation business code.

Packaging is required for distributing a backend release, not for routine local development. A workspace development command starts `ggr-backend` directly from source while exposing the same protocol used by packaged releases. Electron and `ggr-mcp` connect to that development service without being rebuilt. Any supervisor development override must be explicit and must not be enabled in production builds.

## First-run Installation

On first launch Electron:

1. installs or repairs the user-scoped `ggrd` registration;
2. connects to `supervisor.sock`;
3. requests the current stable backend release;
4. asks `ggrd` to install the signed artifact for the current architecture;
5. waits for backend health and protocol handshake success;
6. opens the normal application experience.

If installation fails, Electron presents retry, proxy configuration, and diagnostic-log actions. It must not treat a partially extracted version as installed.

## Update and Rollback

An update is staged beside the active version and never overwrites it:

1. Electron displays the available version and user initiates installation.
2. `ggrd` downloads the manifest, signature, and artifact.
3. `ggrd` validates signature, digest, platform, architecture, client compatibility, and protocol range.
4. The artifact is extracted into a temporary directory and fsynced before becoming a version directory.
5. The candidate performs startup, protocol, dependency, and database-migration rehearsal checks.
6. New tasks are paused and running tasks reach a declared safe point. The user may explicitly cancel tasks instead.
7. `previous` records the current version and `current` changes atomically.
8. The activated backend must pass readiness checks within a fixed deadline.
9. Failure switches `current` back to `previous` and records a rollback diagnostic.

Only the active and previous stable versions are retained by default. Temporary and older versions are cleaned after a successful activation.

After repeated unexpected exits within a defined window, `ggrd` treats the backend as crash-looping. If the current version differs from `previous`, it performs one automatic rollback. It does not alternate versions indefinitely.

## Data Ownership and Migration

The backend is the only process allowed to open its SQLite database or modify durable backend configuration. Electron and MCP clients receive DTOs rather than database entities or raw secret values.

Database updates must be forward-compatible across the rollback window:

- installation rehearses migrations against a database copy;
- activation creates a verified backup before modifying the live database;
- migration failure leaves the original database unchanged;
- the previous backend version must remain able to operate during rollback;
- destructive schema changes require expand-and-contract releases across multiple backend versions.

Cookie and credential responses expose only the minimum UI state required, such as validity, account identity, and expiry. Secret values remain backend-owned.

## Reliability and Observability

- Clients reconnect with bounded exponential backoff and restore event subscriptions.
- Every request and task has a correlation ID used across Electron, `ggrd`, and backend logs.
- A disconnected UI does not cancel backend tasks unless requested explicitly.
- The backend exposes liveness, readiness, current task state, and diagnostic summaries.
- Updates refuse to proceed when disk-space checks fail.
- Downloaded partial artifacts are resumable where supported and never activated.
- Update and database locks prevent concurrent installers or backend owners.
- Supervisor and backend logs use rotation and redact secrets.

## Migration Plan

The extraction proceeds in independently verifiable stages:

1. **Introduce `ggr-protocol`.** Define handshake, envelopes, events, errors, compatibility tests, and transport interfaces.
2. **Create `ggr-backend`.** Move or wrap the existing daemon, automation, browser, configuration, and SQLite flows behind the protocol without rewriting core behavior.
3. **Introduce Electron `BackendClient`.** Replace direct file, database, and backend imports feature by feature. Renderer code receives protocol DTOs through Electron IPC where required.
4. **Convert `ggr-mcp`.** Route all tools to the persistent backend service and remove legacy direct-process startup.
5. **Introduce `ggrd` and independent releases.** Add first-run installation, signed manifests, atomic activation, health checks, and rollback.
6. **Remove obsolete Electron coupling.** Delete backend command modes, backend dependencies, SQLite build hooks, and package-builder inclusion after all callers use the protocol.

During migration, compatibility adapters may remain temporarily, but new UI features must use `BackendClient` rather than adding new direct imports.

## Verification Strategy

Required automated coverage includes:

- protocol schema and backward-compatibility tests;
- Unix socket framing, concurrent request, event, disconnect, and reconnect tests;
- backend lifecycle and crash-loop tests;
- signed-manifest, digest, incompatible-version, interrupted-download, and low-disk tests;
- atomic activation and rollback tests;
- real database migration rehearsal, backup, activation, and rollback fixtures;
- Electron tests against a controllable fake backend;
- `ggr-mcp` contract tests against the same protocol server;
- end-to-end upgrade from the last coupled Electron release to the first decoupled release.

Apple Silicon is the first supported deployment target. Intel macOS artifacts and tests follow using the same design before Windows or Linux implementation begins.

## Acceptance Criteria

The decoupling is complete when:

- a backend-only change can be built, signed, published, installed, and activated without rebuilding Electron;
- closing Electron does not stop active backend work;
- Electron and `ggr-mcp` operate through the same versioned protocol;
- Electron no longer packages or imports backend business logic, native database modules, or browser automation dependencies;
- the backend is the sole database and configuration owner;
- a failed backend update automatically restores the last healthy version;
- first-run installation and subsequent one-click updates work on supported macOS systems.

## Approved Decisions

- Electron performs user-facing update discovery and initiation.
- The backend runs independently after Electron exits.
- Access is restricted to local clients; no network listener is exposed.
- macOS is implemented first, with cross-platform abstractions retained.
- A stable supervisor plus versioned backend runtimes is preferred over direct or self-updating backend replacement.
