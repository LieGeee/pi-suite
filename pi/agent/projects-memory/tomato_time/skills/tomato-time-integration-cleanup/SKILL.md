---
name: tomato-time-integration-cleanup
description: Use when cleaning or validating tomato_time dirty worktrees after integration changes, especially server/web/tag/home/card-pool work.
version: 4
created: 2026-05-23
updated: 2026-05-24
---
## When to Use
Use for tomato_time repo cleanup after integration work when the worktree contains mixed real code changes, generated outputs, and local tool noise.

## Procedure
1. Inspect status with `git status -sb` and `git status --short --untracked-files=all`.
2. Treat current runnable project as `server/` + `web`; do not run `go test ./...` at repo root. Use `npm test`, `npm run test:server`, or `cd server && go test ./...`.
3. Clean only known generated outputs: `dist/`, `web/dist/`, `web/.tmp-tests/generated/`, `server/dist/`. Do not delete unknown untracked source/assets.
4. For frontend focused TS tests, ensure outputs target ignored `web/.tmp-tests/generated/{prompt-draft,landing-wheel,quick-create-plan,tag-selector-tree}`.
5. Validate API wiring with the committed route scanner: `npm run verify:routes`; expected result is `unmatched frontend API calls: 0`.
6. Validate source hygiene with `npm run verify:hygiene`; expected result is `source hygiene issues: 0` for app source (`console.log(` / `debugger` are blocked; tests/docs/generated files are skipped).
7. Run `gofmt -w` on changed Go files, then verify with `git diff --check`.
8. Verification before completion: prefer `npm run ci` for full local parity with GitHub Actions. It runs `npm test`, fresh `cd server && go test ./... -count=1`, `npm run verify:routes`, `npm run verify:hygiene`, `npm run build`, and `git diff --check`.
9. Clean generated outputs afterward: `rm -rf dist web/dist web/.tmp-tests/generated server/dist`.
10. Commit in logical groups rather than `git add .`: integration code/tests, docs/entrypoint cleanup, generated-output cleanup, and optional real assets.
## Pitfalls
- `npm test` may show cached Go packages; use `cd server && go test ./... -count=1` for fresh backend evidence.
- `git status --ignored` may show many local ignored logs/configs (`.playwright-mcp`, `.cursor`, `server/config*.json`, node_modules); these are not dirty worktree items.
- Stats PNGs under `web/public/stats/` are real referenced assets, not generated noise.
- Avoid committing generated `dist/` or old `.tmp-tests` JS outputs.

## Verification
A clean finish should show `git status -sb` with only branch/ahead info and no ordinary short-status entries. Confirm tests/build pass and no generated outputs remain untracked.