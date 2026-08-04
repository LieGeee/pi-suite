---
name: "verify-xlht-order-root-closure"
description: "Verify xl-ht ORDER_ROOT structural-root UI and backend hierarchy invariants after related changes."
version: 1
created: "2026-07-30"
updated: "2026-07-30"
---
## When to Use
Use after changing customer-order confirmation/root creation, BusinessEntrustmentServiceImpl hierarchy handling, ORDER_ROOT mutability, or workEntrustment action projection. This validates source behavior only and does not authorize live database changes or deployment.

## Procedure
1. Confirm the change is isolated to the workEntrustment UI/model/tests and BusinessEntrustmentServiceImpl/tests; inspect other worktree statuses without editing them.
2. Run the four business-work-entrustment Node contract suites with NODE_PATH pointing to the active workspace node_modules.
3. Run the complete hh-system Maven test suite with `mvn -f <worktree>/hh/pom.xml -pl hh-modules/hh-system -am test`.
4. Run `git diff --check`, scan changed Java for post-Java-8 APIs, and verify no menu, SQL migration, Android, fixture, or customer-order Web files changed.
5. Verify ORDER_ROOT projects only VIEW in list/detail/editor; direct editor access is read-only; backend rejects ordinary mutations; formal orders auto-attach or validate the unique root; legacy top-level creation remains covered.

## Pitfalls
- Do not modify or depend on feat/business-customer-order-web while validating the existing workEntrustment pages.
- Do not apply menu SQL, touch menu 4023, mutate live fixtures/data, or change Android permission families as part of this verification.
- A worktree may not have its own node_modules; use NODE_PATH=S:/code/xl-ht/hh-ft-ui/node_modules for the existing contract tests.
- Do not treat hidden UI actions as sufficient: backend update, delete, status, link, and unlink entry points must all reject ORDER_ROOT.

## Verification
1. The workEntrustment Node suites report 44 tests, 0 failures (or the current larger count after future additions).
2. The hh-system Maven suite exits successfully with zero failures/errors.
3. The ORDER_ROOT service test suite covers auto-attachment, missing root, wrong tree, forged update order, generic edit/delete/status, and service-object link/unlink guards.
4. `git diff --check`, Java 8 scan, and scope scan pass, and unrelated worktree status counts remain unchanged.