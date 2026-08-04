---
name: "harden-retirement-tenant-isolation"
description: "Review and harden tenant isolation across JWT auth, task access, gRPC, PostgreSQL references, and tenant provisioning."
version: 3
created: "2026-07-27"
updated: "2026-07-27"
---
## When to Use
Use when changing or auditing tenant/data isolation, staff task visibility, authorization claims, cross-tenant references, or tenant provisioning rollback in the retirement backend.

## Procedure
1. Map the request boundary first: JWT claims must supply tenant and person identity; do not accept tenant or person ownership from HTTP JSON bodies.
2. For tenant tokens, validate the live tenant, person, account, roles, permissions, and must-change-password state before protected gateway handlers run. Platform tokens need an equivalent platform-account check.
3. When adding task behavior, test staff access separately for HTTP and gRPC. In gRPC, require a nonzero operator for any operation whose semantics depend on the current employee, especially ListMyTasks and state changes.
4. For PostgreSQL schema changes, keep `tenants.id` as the parent primary key and use child `tenant_id REFERENCES tenants(id)`. For cross-tenant entity references, use composite keys such as `(tenant_id, person_id) REFERENCES persons(tenant_id, id)`.
5. For legacy fields where 0 means an optional reference, keep 0 compatible and enforce nonzero values with a tenant-scoped trigger instead of a normal FK.
6. Use `NOT VALID` FKs for an existing deployment when historical rows may be inconsistent; they protect new INSERT/UPDATE traffic. Audit and `VALIDATE CONSTRAINT` separately after legacy remediation.
7. Never amend the behavior of an already-recorded migration and expect it to rerun. Put late-added schema protection in a new, idempotent migration, then verify `schema_migrations`, constraint status, and trigger counts on the target database.
8. Test provisioning failure paths that occur after default task template seeding and remove partial tenant templates during rollback.
## Pitfalls
- Matching column names are not required for FKs: child `tenant_id` conventionally references parent `tenants.id`; compatible types and a PK/unique parent key are required.
- A standard FK sees soft-deleted parent rows as existing. Use service checks or triggers when a reference must target an active row.
- `NOT VALID` does not validate historical data, and a passing unit suite does not prove migration execution on PostgreSQL.
- If a migration was applied before its source file gained a trigger or constraint, the migration runner will skip the changed file. Ship a successor migration rather than editing migration history in place.
- Test cleanup ordering matters: register database close cleanup before fixture cleanup so LIFO `t.Cleanup` removes rows while the connection is still open.
- The current Windows PostgreSQL installation may lack runtime libraries; use `RETIREMENT_TEST_DB_DSN` against a real disposable PostgreSQL instance for migration integration tests.
- A gRPC shared secret authenticates an internal caller, not an end user or permission set. Treat independent service exposure as a separate authorization design concern.
## Verification
1. Run `GIN_MODE=release CGO_ENABLED=0 go -C retirement test -count=1 ./...` serially.
2. Run `GIN_MODE=release CGO_ENABLED=0 go -C retirement vet ./...` and `git -C retirement diff --check`.
3. Run PostgreSQL integration tests with `RETIREMENT_TEST_DB_DSN` set, including direct cross-tenant insert rejection tests.
4. Verify migrations 000011 and later apply cleanly in staging and audit any pre-existing invalid references before validating constraints.