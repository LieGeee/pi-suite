---
name: verify-xlht-go-auth-outbox-sync
description: Use when finishing or rechecking xl-ht HT org/person to Go auth outbox sync work.
version: 2
created: 2026-06-22
updated: 2026-06-22
---
## When to Use
Use when verifying xl-ht HT organization/personnel synchronization to Go auth via `sys_go_auth_sync_task` and `go-services/scripts/sync-xlht-to-auth`.

## Procedure
1. Work in `S:/code/xl-ht-worktrees/dock`, not the main `S:/code/xl-ht` checkout.
2. Keep sync boundary: `hh-system` writes outbox tasks; business modules do not call Go auth directly.
3. Verify Java sync tests with `cd /s/code/xl-ht-worktrees/dock/hh && mvn -pl hh-modules/hh-system -am -DfailIfNoTests=false test`.
4. Verify Go sync module with `cd /s/code/xl-ht-worktrees/dock/go-services/scripts/sync-xlht-to-auth && GOWORK=off go test ./... -count=1`.
5. Verify related Go workspace packages with `cd /s/code/xl-ht-worktrees/dock/go-services && go test ./workflow-service/internal/transport/rest ./approval-service/internal/service -count=1`.
6. Verify route/safety regression with `cd /s/code/xl-ht-worktrees/dock/hh && mvn -pl hh-modules/hh-workflow,hh-safety -am -DfailIfNoTests=false test`.
7. Run `git diff --check` before claiming completion.

## Pitfalls
- `sync-xlht-to-auth` is an independent Go module and is not listed in `go.work`; use `GOWORK=off` for its tests.
- Do not mark commit/push done unless explicitly performed; remote auth has previously failed.
- Keep docs in `S:/note/xl-ht/组织部门同步方案/`, not repo `docs/`.
- Do not run multiple `git add --dry-run` commands in parallel in this worktree; even dry-run can contend on `.git/worktrees/dock/index.lock`. Run staging dry-runs serially.
## Verification
Completion evidence should include the Java hh-system test count, Go sync test result, Go workspace package result, workflow/safety test result, and `git diff --check` output.