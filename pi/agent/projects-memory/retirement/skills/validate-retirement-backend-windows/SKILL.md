---
name: "validate-retirement-backend-windows"
description: "Verify the retirement Go backend reliably on Windows when normal or parallel Go tests hang during linking."
version: 1
created: "2026-07-26"
updated: "2026-07-26"
---
## When to Use
Use after retirement backend changes, especially when `go test` has no output, exceeds the harness timeout, or must distinguish a build/link stall from a test deadlock.

## Procedure
1. Run Go commands serially; do not launch multiple `go test` processes in parallel on this Windows environment.
2. For pure-Go verification, run `CGO_ENABLED=0 go -C retirement test -count=1 <packages>` for the changed packages first.
3. Run `CGO_ENABLED=0 go -C retirement test -count=1 ./...` for the full suite.
4. Run `CGO_ENABLED=0 go -C retirement vet <packages>` for the changed packages and affected commands.
5. If a command has no test output, rerun one package with `CGO_ENABLED=0 go -C retirement test -x -v -timeout=20s <package> -run '<test>'`; determine whether the test binary starts before diagnosing a business deadlock.
6. Use `git -C retirement diff --check` and inspect `git status --short` so unrelated concurrent worktree failures are reported without reverting them.

## Pitfalls
- On Go 1.25.1 windows/amd64, parallel test commands and CGO external linking can stall before the test binary starts; Go's `-timeout` cannot fire during that phase.
- Do not classify a harness timeout as a test deadlock unless verbose or `-x` output proves the test binary started.
- The worktree is frequently dirty and may receive concurrent changes; do not revert or repair unrelated packages solely to make the full suite green.
- Race tests in this setup have previously exited with Windows status `0xc0000139`; report that toolchain limitation separately from ordinary test results.

## Verification
1. Changed-package tests exit successfully with `CGO_ENABLED=0`.
2. Affected command packages compile in the targeted test invocation.
3. `go vet` emits no diagnostics for affected packages.
4. The full-suite result is recorded; any unrelated blocker is identified by package and exact compiler/test error.
5. `git diff --check` emits no whitespace errors.