---
name: run-xlht-go-auth-sync
description: Run and verify xl-ht Go auth ↔ HT tenant sync safely.
version: 8
created: 2026-06-20
updated: 2026-06-21
---
## When to Use
Use when executing or verifying xl-ht organization/user/role/post/menu synchronization between Go auth and HT tenants.

## Procedure
1. Confirm auth-service is listening on `127.0.0.1:9081`; if Go compilation fails with disk-space errors, move `TMP`, `TEMP`, `GOTMPDIR`, and `GOCACHE` to `S:/tmp`.
2. Confirm target HT MySQL DSN and tenant IDs explicitly: `GO_TENANT_ID`/`TENANT_ID` and `XLHT_TENANT_ID` must both be reviewed; do not treat them as interchangeable.
3. Ensure mapping DDL exists: `hh/sql/sys_org_dept_mapping.sql` and `hh/sql/sys_go_auth_mapping.sql`.
4. For Go auth → HT, run from `go-services/scripts/sync-auth-to-xlht` with `GOWORK=off`, first `DRY_RUN=true ALLOW_UPDATE=false`, then apply with `DRY_RUN=false ALLOW_UPDATE=false`.
5. Verify mappings in `sys_org_dept_mapping` and `sys_go_auth_mapping`; organization/dept uses `sys_org_dept_mapping`, user/role/post/menu uses `sys_go_auth_mapping`.
6. For HT → Go auth, run `go-services/scripts/sync-xlht-to-auth` with `GOWORK=off`; risky user/role/post sync defaults must remain disabled unless explicitly required.
7. If enabling HT → Go user/role/post sync, verify `sys_go_auth_mapping` is maintained for created users, roles, and posts; `SYNC_USER_ROLES=true` must assign mapped Go user/role IDs, never raw HT `user_id`/`role_id` values.

## Pitfalls
## Pitfalls
- Default/old examples using auth port `9091` are wrong for this environment; use `9081`.
- `xl_ht` database may not exist locally; check actual target DB before apply.
- `XLHT_TENANT_ID` must be explicit or remain its own default; it is not inherited from `GO_TENANT_ID`/`TENANT_ID`.
- Invalid tenant env values must fail fast rather than silently falling back to defaults.
- HT → Go optional role/post/user-role queries must be scoped by `XLHT_TENANT_ID`; `sys_user_role` has no tenant column, so scope through joined `sys_user` and `sys_role`.
- Do not use raw xl-ht IDs as Go auth IDs. User/role/post/menu cross-system IDs must come from `sys_go_auth_mapping`; department/org IDs must come from `sys_org_dept_mapping`.
- Mapping upserts must not rebind `go_id`/`xl_id` or `go_org_id`/`xl_dept_id`; check both directions without `status='0'` before write so inactive/manual conflicts are visible.
- Go auth → HT natural-key matches must check whether the target HT row is already mapped to another Go source before updating/matching; mapped-but-missing HT targets must block fallback creation.
- `hh-ft-ui npm run lint` may fail because `src` is ignored by ESLint config; use `npm run build:prod` for frontend build verification if needed.
## Pitfalls
- Default/old examples using auth port `9091` are wrong for this environment; use `9081`.
- `xl_ht` database may not exist locally; check actual target DB before apply.
- `XLHT_TENANT_ID` must be explicit or remain its own default; it is not inherited from `GO_TENANT_ID`/`TENANT_ID`.
- HT → Go optional role/post/user-role queries must be scoped by `XLHT_TENANT_ID`; `sys_user_role` has no tenant column, so scope through joined `sys_user` and `sys_role`.
- Do not use raw xl-ht IDs as Go auth IDs. User/role/post/menu cross-system IDs must come from `sys_go_auth_mapping`; department/org IDs must come from `sys_org_dept_mapping`.
- Mapping upserts must not rebind `go_id`/`xl_id` or `go_org_id`/`xl_dept_id`; check both directions without `status='0'` before write so inactive/manual conflicts are visible.
- Go auth → HT natural-key matches must check whether the target HT row is already mapped to another Go source before updating/matching; mapped-but-missing HT targets must block fallback creation.
- `hh-ft-ui npm run lint` may fail because `src` is ignored by ESLint config; use `npm run build:prod` for frontend build verification if needed.
## Verification
- `cd go-services/scripts/sync-auth-to-xlht && GOWORK=off go test ./... -count=1`
- `cd go-services/scripts/sync-xlht-to-auth && GOWORK=off go test ./... -count=1`
- `cd go-services/workflow-service && TMP='S:/tmp/win-temp' TEMP='S:/tmp/win-temp' GOTMPDIR='S:/tmp/go-build' GOCACHE='S:/tmp/go-cache' go test ./... -count=1`
- `cd go-services/approval-service && TMP='S:/tmp/win-temp' TEMP='S:/tmp/win-temp' GOTMPDIR='S:/tmp/go-build' GOCACHE='S:/tmp/go-cache' go test ./... -count=1`
- `cd go-services/task-service && go test ./... -count=1`
- `cd hh && mvn -pl hh-modules/hh-workflow,hh-modules/hh-system -am -DskipTests compile`
- `cd hh && mvn -pl hh-safety -am -DskipTests compile`
- `cd hh && mvn -pl hh-modules/hh-application,hh-modules/hh-job -am -DskipTests compile`
- `cd hh-ft-ui && npm run build:prod`