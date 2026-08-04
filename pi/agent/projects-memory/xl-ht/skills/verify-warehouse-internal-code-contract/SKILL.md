---
name: verify-warehouse-internal-code-contract
description: Use when verifying xl-ht warehouse/area/position/slot/dock/staging internal-code changes before commit or deployment.
version: 1
created: 2026-07-15
updated: 2026-07-15
---
## When to Use
Use after changing xl-ht warehouse layout internal-code generation, immutability, frontend visibility, PNG/ETag, or grid creation behavior.

## Procedure
1. From `S:/code/xl-ht/hh`, run the warehouse 12-class Maven suite: `FtStockWarehouseControllerTest,WarehouseLayoutControllerTest,WarehouseLayoutImageEtagTest,WarehouseLayoutPngRendererTest,FtStockWarehouseMapperLayoutInsertTest,WarehouseCodeUpdateMapperContractTest,WarehouseLayoutMapperFlowTest,WarehouseAutomaticCodeServiceTest,WarehouseLayoutAutomaticCodeTest,WarehouseLayoutImageServiceImplTest,WarehouseLayoutServiceImplTest,WarehouseLayoutTransactionFlowTest`.
2. Run `mvn -pl hh-modules/hh-stock -am -DskipTests package`.
3. From `S:/code/xl-ht/hh-ft-ui`, run Node tests: `warehouse-layout-geometry.test.cjs`, `warehouse-layout-api.test.cjs`, `warehouse-layout-spaces-ui.test.cjs`, `warehouse-layout-editor-ui.test.cjs`, `warehouse-internal-codes-ui.test.cjs`.
4. Run `npm run build:prod`.
5. Run local ESLint with `--no-ignore` on the changed warehouse API/Vue/CJS files, then cross-reference findings with `git diff HEAD --unified=0`; require zero findings on changed lines.
6. Run `git diff --check HEAD` and inspect `git status --short --untracked-files=all` before staging.
7. Verify update SQL never assigns `code`, `area_code`, `slot_code`, `dock_code`, or `staging_code` through client-controlled update paths; verify frontend mutation clients remove `code` and position mutations also remove `areaCode`.

## Pitfalls
- Do not use root `npm run lint` as evidence: `.eslintignore` causes all `src` files to be ignored.
- Four legacy warehouse Vue files have a large pre-existing formatting baseline; do not mass-format them during functional work. Attribute lint findings to changed lines.
- `-DskipTests package` proves packaging only, not test health.
- Source/JAR changes do not update the running JVM; do not claim runtime deployment without an authorized `hh-stock` restart.
- Do not access the live DB or start services that register with remote Nacos unless explicitly authorized.

## Verification
Expected task baseline as of 2026-07-15: warehouse backend suite 100 tests; frontend warehouse suite 57 tests; changed-line lint 0; `git diff --check` exit 0; backend package and frontend production build exit 0. Record exact logs under `S:/temp/xlht-warehouse-layout/`.