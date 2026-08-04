# Mobile Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a mobile-first browser client that connects to `pi-mobile-relay`, shows pi-gui tasks/conversation details, receives notifications, and sends authorized task commands.

**Architecture:** A Vite + React SPA stores relay URL and pair token in localStorage, opens one WebSocket to `/ws/mobile`, sends `mobile.hello`, and maintains an app state reducer from relay events. UI is split into login/settings, task list, conversation detail, notification strip, and composer/actions.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, Testing Library, jsdom.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `README.md`

- [x] Add scripts: `dev`, `build`, `preview`, `test`.
- [x] Add dependencies: `@vitejs/plugin-react`, `vite`, `typescript`, `react`, `react-dom`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`.
- [x] Document local usage with relay URL and pair token.

### Task 2: Protocol and reducer

**Files:**
- Create: `src/protocol.ts`
- Create: `src/mobile-state.ts`
- Test: `tests/mobile-state.test.ts`

- [x] Define relay event and command types.
- [x] Implement reducer for `server.ready`, `server.snapshot`, `desktop.snapshot`, `desktop.transcript`, `desktop.notification`, `command.completed`, `command.failed`, `server.authFailed`, and socket status changes.
- [x] Implement selectors for flattened task list and selected task.
- [x] Test snapshots, notifications, transcript updates, and command failures.

### Task 3: WebSocket client hook

**Files:**
- Create: `src/use-mobile-relay.ts`
- Test: `tests/use-mobile-relay.test.tsx`

- [x] Connect to configured relay URL.
- [x] Send `mobile.hello` on open.
- [x] Dispatch parsed relay messages into reducer.
- [x] Provide command helpers: `requestTranscript`, `sendMessage`, `stopRun`, `createSession`, `selectTask`.
- [x] Handle invalid JSON and close/error status.

### Task 4: Mobile UI

**Files:**
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `src/styles.css`
- Test: `tests/App.test.tsx`

- [x] Login/settings form for relay URL and pair token.
- [x] Mobile-first task list with workspace name, title, preview, status, unread indicator.
- [x] Conversation detail page with transcript messages and tool/status rows.
- [x] Composer for follow-up messages.
- [x] Action buttons for request transcript, stop run, create task, refresh/reconnect.
- [x] Notification strip for recent notifications and command errors.

### Task 5: End-to-end local smoke

**Files:**
- Modify: `README.md`

- [x] Start `pi-mobile-relay`.
- [x] Create pair token.
- [x] Run relay mock desktop.
- [x] Run mobile web client.
- [x] Confirm browser UI shows mock task and can send command.

### Task 6: Verification

**Files:**
- No new files.

- [x] Run `pnpm test`.
- [x] Run `pnpm run build`.
- [x] Confirm generated `dist` has no raw pair token or server secrets.
