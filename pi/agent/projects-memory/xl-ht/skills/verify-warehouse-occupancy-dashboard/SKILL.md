---
name: verify-warehouse-occupancy-dashboard
description: Use after changing xl-ht's warehouse occupancy dashboard, full-slot heatmap, polling, or menu wiring.
version: 1
created: 2026-07-15
updated: 2026-07-15
---
## When to Use

Use after changing `hh-ft-ui/src/views/stock/warehouseOccupancy/**`, its tests, or `hh/sql/add_warehouse_occupancy_dashboard_menu.sql`.

## Procedure

1. Run focused tests:
   ```bash
   cd hh-ft-ui
   npm run test:warehouse-occupancy-dashboard
   ```
2. Run existing warehouse-layout regressions from repo root:
   ```bash
   node --test hh-ft-ui/scripts/warehouse-layout-api.test.cjs \
     hh-ft-ui/scripts/warehouse-layout-geometry.test.cjs \
     hh-ft-ui/scripts/warehouse-layout-editor-ui.test.cjs
   ```
3. Compile both Vue templates with the existing main-workspace `vue-template-compiler` when the worktree has no dependencies.
4. Force ESLint with `--no-ignore` because the repo `.eslintignore` ignores top-level `.vue` patterns. Expect zero errors; self-closing warnings are non-blocking unless the team elects to normalize them.
5. Build production. In an isolated worktree on Windows, Sass `~element-ui` resolution does not honor `NODE_PATH`; temporarily create a junction from the worktree `hh-ft-ui/node_modules` to `S:\code\xl-ht\hh-ft-ui\node_modules`, build, then remove only the junction and generated output.
6. Confirm changed scope does not include `warehouseLayout/**`, `hh-stock/**`, lockfiles, or temporary smoke assets.

## Pitfalls

- Never generate slots from `rowNum × colNum`; only render normalized real first-layer slot records.
- Do not use per-slot Element tooltips; use delegated hover for thousands of cells.
- Browser fullscreen must target the document (`screenfull.request()`), not only the dashboard root, because Element UI drawers and select poppers append to `body`.
- Database menu component `stock/warehouseOccupancy/index` is dynamically resolved through `permission.js`; no duplicate static router entry is required.
- Do not run the menu SQL against the live database during verification; it is a deployment migration requiring DBA review.

## Verification

Required evidence:
- focused dashboard tests pass;
- 44 existing warehouse-layout tests pass;
- Vue templates compile;
- ESLint reports zero errors;
- production build exits 0;
- worktree is clean and temporary dependency junction/build output are absent.

For browser smoke data, verify all warehouses, exact real slot counts (including a 175-slot position), empty cell text, hover/details, distinct occupancy colors, independent status overlays, 30-second refresh preserving zoom/scroll/selection, and narrow-screen sidebar reflow.