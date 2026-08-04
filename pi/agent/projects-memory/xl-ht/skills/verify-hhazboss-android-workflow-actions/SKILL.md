---
name: verify-hhazboss-android-workflow-actions
description: Use after changing hh-az-boss Android workflow/task/approval UI or API action wiring.
version: 1
created: 2026-07-01
updated: 2026-07-01
---
## When to Use
Use after modifying `S:/code/xl-ht/hh-az-boss` Android code that touches workflow approvals, task lists/details, action buttons, API payloads, or Obsidian implementation notes.

## Procedure
1. Keep scope under `S:/code/xl-ht/hh-az-boss`; do not touch unrelated dirty files in sibling projects unless explicitly requested.
2. For workflow/task action changes, cross-check existing web/API contracts:
   - `S:/code/xl-ht/hh-ft-ui/src/api/workflow/approval.js`
   - `S:/code/xl-ht/hh-ft-ui/src/api/workflow/task.js`
   - relevant `go-services/workflow-service/internal/transport/rest/*_test.go` tests.
3. Ensure approval action body matches `ProcessNodeRequest`: `instance_id`, `node_id`, `action`, `comment`, `attachments`; prefer `flow_node_id` for `node_id`, fallback to node `id`.
4. Ensure task action statuses match existing web behavior: `task_status=20` -> claim endpoint payload `30`; `task_status=60` -> update endpoint payload `70`.
5. Add or update JVM unit tests that use a local `HttpServer` when verifying outgoing method/path/body; do not depend on a live backend for contract tests.
6. Run fresh verification from `S:/code/xl-ht/hh-az-boss`:
   ```bash
   ./gradlew.bat --rerun-tasks :app:testDebugUnitTest :app:assembleDebug && git diff --check
   ```
7. Update `S:/note/xl-ht/领导端需求整理/08-hh-az-boss开发进度.md` when the implementation status changes.

## Pitfalls
- `Dialog` is imported from `androidx.compose.ui.window.Dialog`, not Material3.
- JVM tests need real `org.json:json` dependency; Android's stub can throw `Method ... not mocked`.
- `git diff --check` may emit an existing CRLF/LF warning for `app/src/main/AndroidManifest.xml`; distinguish it from actual whitespace errors.
- Approval/task UI should stay an aggregation layer over workflow/task/approval/safety APIs, not read business tables directly.

## Verification
A clean verification has `BUILD SUCCESSFUL` for unit tests and debug APK assembly. `git diff --check` should have no errors; the known AndroidManifest CRLF warning alone is acceptable if unchanged.