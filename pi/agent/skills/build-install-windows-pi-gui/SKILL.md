---
name: build-install-windows-pi-gui
description: Use when building, smoke-testing, backing up, and installing the user's Windows pi-gui from source.
version: 4
created: 2026-07-10
updated: 2026-07-17
---
## When to Use
Use when updating the Windows pi-gui source at `S:/tool/pi/tmp-pi-gui` and installing it to `S:/tool/pi-gui`.

## Procedure
1. Treat `S:/tool/pi/tmp-pi-gui` as the only source, test, and build directory. `C:/Users/leizh/tmp-pi-gui` is a deprecated migration source and must never be used for builds; remove it after its unique files have been reconciled and the S: build is verified.
2. Production pi-gui data is `S:/tool/pi/gui-data`; Pi sessions are `S:/tool/pi/agent/sessions`; Pi-related temp is `S:/tool/pi/tmp`. Do not redirect these back to C:.
3. Before modifying or installing, preserve source/user changes. Snapshot source without `node_modules`, `out`, `release*`, Playwright artifacts, or other generated caches. Before installation, back up both `S:/tool/pi-gui` and `S:/tool/pi/gui-data`.
4. Run focused tests and `pnpm --filter @pi-gui/desktop typecheck` from `S:/tool/pi/tmp-pi-gui`.
5. Build from `S:/tool/pi/tmp-pi-gui/apps/desktop` with `pnpm run build` and `pnpm exec electron-builder --win --dir --publish never`.
6. Smoke-test `S:/tool/pi/tmp-pi-gui/apps/desktop/release/win-unpacked/pi-gui.exe` with `PI_APP_USER_DATA_DIR` set to a fresh directory under `S:/tool/pi/tmp`; verify the renderer/process uses that path, then stop all smoke processes.
7. Stop the installed app. Under Git Bash, use `MSYS2_ARG_CONV_EXCL='*' taskkill.exe /IM pi-gui.exe /F`.
8. Copy `release/win-unpacked/.` over `S:/tool/pi-gui/` only after backups and isolated smoke pass.
9. Compare SHA-256 for `pi-gui.exe` and `resources/app.asar` between build and install.
10. Launch `S:/tool/pi-gui/pi-gui.exe`; verify command lines use `--user-data-dir=S:/tool/pi/gui-data`, Electron reports temp/TEMP/TMP/TMPDIR as `S:/tool/pi/tmp`, and production session/transcript reference sets and counts remain intact.

## Pitfalls
- `S:/tool/pi-gui` is a packaged installation, not source. Never edit or build from it.
- Do not copy the deprecated C: source tree over S:. The S: source contains independent later changes (including Chinese UI and session classification); reconcile only task-related differences.
- Git Bash rewrites Windows slash arguments (`/IM`) unless `MSYS2_ARG_CONV_EXCL='*'` is set.
- `@electron/asar extract-file` expects archive path formatting that can be awkward on Windows; `asar list` plus `strings app.asar` is sufficient for marker checks.
- Windows packaged tests must resolve `release/win-unpacked/pi-gui.exe`; macOS-only helpers that search for `.app` bundles need a `win32` branch.
- Run `pnpm.cmd` from Node through `cmd.exe /d /s /c` on Windows. Direct `execFileSync("pnpm.cmd", ...)` can fail with `EINVAL`.
- Importing modules from an extracted asar can keep Windows handles open until Node exits. Use delayed out-of-process cleanup for the temporary extraction directory.
- Do not treat existing Windows-only full-core failures as regressions without rerunning focused affected specs.
- A production startup can legitimately refresh `catalogs.json` and discover a session already present under `PI_CODING_AGENT_DIR`. Verify workspace/session reference sets and transcript/session counts, not only the catalog byte hash.
- Stop isolated smoke processes before using broad `taskkill /IM pi-gui.exe`.

## Verification
- Commands are run from `S:/tool/pi/tmp-pi-gui` and focused regression tests pass.
- Desktop typecheck exits 0.
- Isolated packaged app launches and creates temp `ui-state.json` under `S:/tool/pi/tmp`.
- Built and installed `pi-gui.exe` and `resources/app.asar` hashes match.
- Installed app launches from `S:/tool/pi-gui` using `S:/tool/pi/gui-data`, `S:/tool/pi/agent`, and `S:/tool/pi/tmp`.
- Production workspace/session reference sets and Pi-session/GUI-transcript counts remain intact.