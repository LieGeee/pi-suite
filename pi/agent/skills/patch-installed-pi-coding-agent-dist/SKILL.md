---
name: patch-installed-pi-coding-agent-dist
description: Use when modifying the user's globally installed @mariozechner/pi-coding-agent npm package, which is published as dist-only JS on Windows.
version: 1
created: 2026-05-23
updated: 2026-05-23
---
## When to Use
Use when the task requires changing the user's installed Pi coding agent package at `C:\Users\leizh\AppData\Roaming\npm\node_modules\@mariozechner\pi-coding-agent`, especially TUI/runtime behavior.

## Procedure
1. Confirm the package path and version with `node -e "console.log(require('<path>/package.json').version)"` or by reading `package.json`.
2. Inspect `dist/` files directly; the installed package may not include `src/`.
3. Patch runtime files in `dist/**/*.js` and keep related `dist/**/*.d.ts` and docs synchronized when exports/keybindings/user-facing behavior change.
4. For Node ESM tests on Windows, import absolute files through `pathToFileURL(...)` or `file://` URLs; raw `C:/...` imports fail with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
5. Prefer a temporary Node script under `%TEMP%`/`AppData\Local\Temp` for focused regression checks when the package has no installed test runner dependencies.

## Pitfalls
- `npm test` may be unavailable in the installed global package because dev dependencies like Vitest are not installed.
- `*.map` files contain embedded source and can make searches noisy; use `rg --glob '!*.map'`.
- Runtime patches can be overwritten by `pi update`/npm reinstall; document changed files.
- If Pi TUI is already running, restart it to pick up patched JS.

## Verification
- Run `node --check` on every edited JS file.
- Run the focused temp regression script.
- Run `node <package>/dist/cli.js --version` to confirm the CLI still loads.
- For keybinding changes, import `dist/core/keybindings.js` with `pathToFileURL` and inspect `KEYBINDINGS[...]`.