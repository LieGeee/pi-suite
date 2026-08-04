# Mobile Relay Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a standalone relay server that lets pi-gui desktop and mobile clients connect to the same server and have the server forward snapshots, notifications, transcripts, and commands between paired devices.

**Architecture:** A small Node.js TypeScript service exposes HTTP health/pairing APIs and two WebSocket endpoints: `/ws/desktop` and `/ws/mobile`. Runtime connection routing is in-memory per pair token, while SQLite stores pairings, latest desktop snapshots, recent notifications, and command logs for reconnect/offline recovery.

**Tech Stack:** Node.js 24, TypeScript, native `node:http`, `ws`, built-in `node:sqlite`, Node test runner.

---

### Task 1: Project scaffold and scripts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`

- [x] Write project metadata with `build`, `start`, `dev`, and `test` scripts.
- [x] Configure TypeScript for NodeNext output into `dist`.
- [x] Document env vars: `PORT`, `HOST`, `RELAY_DB_PATH`, `PAIR_TOKEN_SALT`.
- [x] Run `pnpm install` and `pnpm run build`.

### Task 2: Protocol and storage

**Files:**
- Create: `src/protocol.ts`
- Create: `src/store.ts`
- Test: `tests/store.test.ts`

- [x] Define relay envelope types for `desktop.hello`, `mobile.hello`, `desktop.snapshot`, `desktop.notification`, `mobile.command`, `command.completed`, `command.failed`, `server.authFailed`, `server.ready`, and `server.snapshot`.
- [x] Implement `RelayStore` on SQLite with tables: `pairings`, `latest_snapshots`, `notifications`, `command_log`.
- [x] Hash pair tokens with SHA-256 + salt before storage.
- [x] Test pair creation, token verification, snapshot upsert, notification retention, and command dedupe.

### Task 3: Relay room runtime

**Files:**
- Create: `src/relay.ts`
- Test: `tests/relay.test.ts`

- [x] Implement in-memory rooms keyed by token hash.
- [x] Desktop `desktop.hello` authenticates room and records permissions.
- [x] Mobile `mobile.hello` authenticates room and receives cached snapshot/notifications.
- [x] Forward desktop events to all paired mobile sockets.
- [x] Forward mobile commands to desktop only when desktop is online and commandId is not duplicated.
- [x] Reject unauthorized or offline commands with `command.failed`.
- [x] Forward `server.authFailed` when hello token is invalid.

### Task 4: HTTP/WebSocket server

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Test: `tests/server.test.ts`

- [x] Implement `GET /api/health`.
- [x] Implement `POST /api/pair/create` returning a generated pair token.
- [x] Implement `POST /api/pair/revoke`.
- [x] Mount WebSocket endpoints `/ws/desktop` and `/ws/mobile`.
- [x] Test HTTP APIs and end-to-end desktop/mobile forwarding.

### Task 5: Developer tooling and examples

**Files:**
- Create: `scripts/mock-desktop.mjs`
- Create: `scripts/mock-mobile.mjs`
- Modify: `README.md`

- [x] Add mock desktop script that connects, sends `desktop.hello`, `desktop.snapshot`, and logs mobile commands.
- [x] Add mock mobile script that connects, sends `mobile.hello`, requests task list, and sends a sample command.
- [x] Document local run flow: start server, create token, run mock desktop, run mock mobile.

### Task 6: Verification

**Files:**
- No new files.

- [x] Run `pnpm run build`.
- [x] Run `pnpm test`.
- [x] Run mock desktop/mobile manually against local server.
- [x] Confirm the service never stores raw pair token, model keys, `auth.json`, or local `.pi/settings.json`.

