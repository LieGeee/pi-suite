---
name: maintain-s-tool-pi-runtime
description: Use when maintaining the user's S:\tool\pi runtime migration, pi/piw wrappers, worktree isolation, or TUI scroll patch.
version: 3
created: 2026-06-08
updated: 2026-07-13
---
## When to Use
Use for work on the user's Pi setup under `S:\tool\pi`, including runtime migration, `pi`/`piw` wrappers, worktree isolation, migration script changes, and the pi-tui scroll stability patch.

## Procedure
## Procedure
1. Treat `S:\tool\pi` as the active Pi home/config/runtime area.
2. Verify launch chain with:
   - `where.exe pi`
   - `where.exe piw`
   - `pi --version`
   Expected high-priority shims are `C:\Users\leizh\bin\pi.cmd` and `C:\Users\leizh\bin\piw.cmd`, forwarding to `S:\tool\pi\agent\bin`.
3. Do not set `PI_PACKAGE_DIR` to `S:\tool\pi\packages`; in Pi 0.73.0 it is used to locate Pi's own package root and breaks startup if pointed at a non-package directory.
4. Do not set `PI_CODING_AGENT_SESSION_DIR` to `S:\tool\pi\agent\sessions`; in Pi 0.73.0 `sessionDir` means the current project's concrete session subdirectory, not the sessions root. Leave it unset so Pi derives `S:\tool\pi\agent\sessions\<encoded-cwd>` from `PI_CODING_AGENT_DIR`.
5. If `pi -r` says "No sessions in current folder" but session files exist, run:
   - `node S:/tool/pi/tmp/pi-session-current-folder-regression.mjs`
   - `bash S:/tool/pi/tmp/pi-session-wrapper-env-regression.sh`
6. For branch isolation, use `piw <branch>` from inside a Git repo. It creates/reuses worktrees under `S:\tool\pi\worktrees\<repo-name>-<repo-hash>\<branch-safe>-<branch-hash>` and launches Pi there.
7. When touching `piw.ps1`, run the regression scripts:
   - `bash S:/tool/pi/tmp/piw-collision-regression.sh`
   - `bash S:/tool/pi/tmp/piw-worktree-edge-regression.sh`
   - `bash S:/tool/pi/tmp/piw-literal-path-regression.sh`
8. When touching the TUI patch, run:
   - `node --check S:/tool/pi/runtime/node_modules/@mariozechner/pi-coding-agent/node_modules/@mariozechner/pi-tui/dist/tui.js`
   - `node S:/tool/pi/tmp/pi-tui-scroll-regression.mjs`
## Pitfalls
## Pitfalls
- `S:\tool\pi` itself is not a Git repo, so normal finishing/merge workflows may not apply.
- Git Bash can convert Windows `cmd.exe /c` arguments; use `MSYS2_ARG_CONV_EXCL='*'` for literal Windows command verification.
- PowerShell wildcard metacharacters in paths (`[`, `]`) require literal-path handling.
- Re-running migration must not overwrite `agent\bin` wrappers or current sessions.
- Pi-related temporary files must stay under `S:\tool\pi\tmp`, not C:. `pi.cmd`, `pi.ps1`, and `piw.ps1` set `TEMP`, `TMP`, and `TMPDIR`; preserve those settings when editing wrappers.
- DeepSeek thinking-format models via anthropic-messages (dpsk provider) intermittently 400 with `reasoning_content must be passed back to the API` on multi-turn resume. Root cause: when a prior assistant thinking block loses its signature (interrupted/aborted stream), pi's anthropic adapter (`@mariozechner/pi-ai/dist/providers/anthropic.js` `convertMessages`) converts it to plain text instead of echoing it; DeepSeek needs the thinking echoed. Fix is a runtime patch: for `isDeepSeekThinkingFormat(model)`, keep the thinking block (without signature) instead of converting to plain text. Backup at `S:\tool\pi\tmp\anthropic.js.bak`. `pi update`/reinstall overwrites this patch; re-apply after updates.
## Verification
Run the full verification sequence used after migration: check `where pi/piw`, direct runtime `--version`, S wrappers, C shims, bare `pi`, wrapper smoke, all `piw` regressions, TUI regression, wrapper env scoping, PowerShell parse checks, and README/spec/plan doc checks.