---
name: "verify-yard-layout-expansion"
description: "Verify xl-ht yard bay/tier layout, PHYSICAL/BLOCK cells, footprint reservations, SQL initialization, and workbench rendering before commit or deployment."
version: 1
created: "2026-07-22"
updated: "2026-07-22"
---
## When to Use
Use after changing CY01 yard coordinates, bay/tier labels, ft_stock_yard_slot.cell_type, blocked layout cells, placement candidates, capacity counts, or yard initialization SQL.

## Procedure
1. Run `node hh-ft-ui/scripts/yard-slot-matrix-model.test.cjs`, `node hh-ft-ui/scripts/yard-workbench-model.test.cjs`, and `node hh-ft-ui/scripts/yard-container-ui.test.cjs`.
2. Run `mvn -f hh/pom.xml -pl hh-modules/hh-stock -am -DskipTests=false -Dtest=FtStockYardSlotJsonTest,YardSlotServiceImplTest,YardWorkbenchServiceImplTest,FtStockYardAppearanceJsonTest -Dsurefire.failIfNoSpecifiedTests=false test`.
3. Run `npm --prefix hh-ft-ui run build:prod` and distinguish pre-existing warnings from new build failures.
4. Run `git diff --check`; stage only yard/product files and inspect `git diff --cached --name-status` before committing.
5. Before database deployment, back up ft_stock_yard_slot and apply schema migration before deploying mapper code that selects cell_type; then run init SQL twice and verify the second run inserts zero rows.

## Pitfalls
- A BLOCK cell reserves its odd/even Y footprint; excluding it only as a direct target still permits overlapping 20/40/45-foot allocations.
- The workbench query must include PHYSICAL and BLOCK cells, while business capacity and placement counts include PHYSICAL only.
- CY01 tier counts are variable: bays 1-10 use tiers 1-2; bays 11-12 use tiers 1-3. Do not expand all bays to tier 3.
- Do not infer ambiguous right-side column numbers from the reference image; store only confirmed coordinates.
- Do not deploy mapper code that selects cell_type before the repeatable schema migration adds the column.

## Verification
1. All three Node suites pass with no failures.
2. Focused Maven tests pass and MyBatis resources compile.
3. The production frontend build completes; only known repository warnings remain.
4. `git diff --check` passes and staging excludes .superpowers, NUL/nul, cp.txt, and root package-lock.json.
5. After push, local HEAD equals `git ls-remote origin refs/heads/dev_storage`.