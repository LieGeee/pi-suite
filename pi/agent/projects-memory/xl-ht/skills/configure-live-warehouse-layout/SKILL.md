---
name: configure-live-warehouse-layout
description: Use when initializing, correcting, or verifying xl-ht warehouse 2D layouts and independently positioned pallet slots in the live ft_data database.
version: 2
created: 2026-07-10
updated: 2026-07-11
---
## When to Use
Use for a real-database change to `ft_stock_warehouse`, `ft_stock_warehouse_pos`, or `ft_stock_warehouse_pos_matrix`, especially when translating a drawing into editable centimeter coordinates.

## Procedure
1. Read the current warehouse, positions, slots, pallet occupancy, and `layout_version` using a read-only connection.
2. Put scripts and JSON backups under `S:\temp\xlht-warehouse-layout\`; never use `C:` for large temporary output.
3. Back up the exact warehouse, its positions, and its slots before any mutation.
4. Preserve tenant isolation: every query/update must constrain `tenant_id` and warehouse identity.
5. Reject a slot rebuild or deletion if any affected slot is occupied by a pallet.
6. Use centimeters with top-left origin. A user adds each independent slot at a chosen position within its warehouse position; persist its own offset, width, and height. Do not infer or overwrite manual slot locations with an automatic row×column grid.
7. Update geometry and increment `layout_version` once for a coordinated layout change. Do not increment it for later pallet movements.
8. Independently read back: canvas dimensions, default pallet size, version, per-position X/Y/size, each slot’s offset/size, and occupied-slot constraints.
9. Keep drawing scale as a reference note only. The UI and database coordinates remain physical centimeters; screen zoom is not a drawing scale.

## Verification
For the current 丙二仓 (`warehouse_id=22`, `tenant_id=9`), record the existing dataset before changing it:
- canvas `8300 × 3500cm`, grid `10cm`, default pallet `120 × 120cm`;
- positions `2-2-A` through `2-2-H` currently each have `950 × 3000cm`, `7 × 25`, and 175 legacy slots;
- current total is 1400 slots, all `120 × 120cm`.

This is historical layout data, not a rule for future manual slot creation.

## Pitfalls
- Do not create a warehouse-position code unique index until the known historical duplicates are resolved.
- Do not infer precise physical dimensions solely from a wall-detail drawing; label such values as editable estimates.
- Canvas blocks must visibly annotate X, Y, width, and height; form fields alone are insufficient.
- Do not mutate `hh-ft-ui/dist/`, root `package-lock.json`, `.superpowers/`, or `NUL` when committing source changes.
- A failed aggregate query due to ambiguous `width_cm`/`height_cm` must qualify columns as `pos.*` or `slot.*`; it is not evidence that data updates failed.