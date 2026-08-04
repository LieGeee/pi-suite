---
name: "harden-retirement-org-integrity"
description: "Review and harden organization, position, and person-organization relationship changes in the retirement backend."
version: 1
created: "2026-07-26"
updated: "2026-07-26"
---
## When to Use
Use when changing org units, positions, person-org bindings, superior relationships, or their Gateway endpoints in this repository.

## Procedure
1. Inspect both the Gateway handler route parameters and the org service/repository contracts; route person IDs must be authoritative for person-scoped endpoints.
2. For HTTP fields whose omission means preserve, use pointer fields in request DTOs and repository-level atomic partial UPDATE statements rather than service read-modify-write.
3. Apply tenant conditions to every update/delete query and every InMemoryRepo mutation, then validate referenced organization, position, and person ownership in the write transaction.
4. For create/delete races around org units and positions, use transaction-scoped PostgreSQL advisory locks with stable resource-specific keys and revalidate references after locking.
5. Inject org.PersonChecker in the composed Gateway so memory mode and production both reject bindings to nonexistent or cross-tenant people; PostgreSQL repository must independently verify active persons for direct callers.
6. Cover omitted-field preservation, cross-tenant updates, path/body person-ID mismatch, mismatched unbind routes, person validation, superior self-reference, and referenced-delete behavior.
7. Run gofmt on touched Go files, go test ./internal/org ./internal/gateway, then go test ./... and go vet ./... .

## Pitfalls
- Do not trust request-body person_id when the route is /persons/:id/..., and include person_id in the unbind repository predicate.
- A local row lock on a person check does not solve long-term soft-delete lifecycle semantics by itself; define deletion cleanup/cascade policy before exposing general person deletion.
- Do not use a zero-valued numeric field to distinguish omitted from explicitly supplied sort in HTTP JSON.

## Verification
1. Targeted org and gateway regression tests pass.
2. go test ./... and go vet ./... pass.
3. git diff --check is clean.
4. If frontend behavior changes, run cd ../retirement-app && npm run test:ui && npm run build:h5.