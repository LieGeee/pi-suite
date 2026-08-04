---
name: "validate-retirement-operational-ui"
description: "Validate the retirement app's role dashboards, task presentation helpers, bed board, and H5 production build after operational UI changes."
version: 3
created: "2026-07-26"
updated: "2026-07-26"
---
## When to Use
Use after modifying retirement-app role dashboards, task lists, space/bed views, or the operations presentation utility.

## Procedure
1. Run `cd retirement-app && npm run test:ui` to verify task status, bed status, task normalization, status counts, and tree bed extraction behavior.
2. Run both `cd retirement-app && npm run build:h5` and `cd retirement-app && npx uni build -p app`; require `DONE Build complete.` from each.
3. Verify core route registrations in `src/pages.json` for home, task, stats, space, elder, and person pages.
4. For Android role changes, sync through HBuilderX 5.14, relaunch `io.dcloud.HBuilder`, then log in with the target role. Verify the dedicated workbench, real PostgreSQL counts, task labels, and visible state-action buttons through a UIAutomator dump and screenshot.
5. For timeout UI changes, verify `/stats/tasks` exposes the flat `timeout` field, open the Android task statistics page, and confirm `已超时` shows the same count as `items.TIMEOUT`.
6. If a local H5 server is needed, start `npm run dev:h5 -- --host 127.0.0.1 --port 5173` and confirm `curl -I http://127.0.0.1:5173/` returns HTTP 200.
## Pitfalls
- Do not convert request failures into empty lists; use ErrorState with retry.
- Treat legacy `ENABLED` beds as available alongside `EMPTY` beds in board filtering.
- Task presentation should use gateway-resolved elder, bed, creator, and assignee names. Fall back to Chinese unavailable labels only when an existing relation cannot be resolved; never render raw IDs.
- Repair tasks move from `REPAIRING` or `PENDING_PROCESS` to `PROCESSING` after start, so the repair workbench's “维修中” metric must include both `REPAIRING` and `PROCESSING`.
- HBuilder CLI completion can leave the Android launcher visible; relaunch the existing debug base before treating the app as unavailable.
## Verification
1. `npm run test:ui` reports all tests passing.
2. `npm run build:h5` completes successfully.
3. The preview endpoint returns HTTP 200 when started.