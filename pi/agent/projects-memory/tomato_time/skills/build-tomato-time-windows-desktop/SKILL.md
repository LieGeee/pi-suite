---
name: "build-tomato-time-windows-desktop"
description: "Build the tomato_time Tauri Windows desktop installer on this Windows workspace."
version: 5
created: "2026-07-29"
updated: "2026-08-03"
---
## When to Use
Use when producing or verifying the Windows .exe installer for the tomato_time floating desktop widget in this repo.

## Procedure
2. Before the full build, a fast Rust cycle check is to create a variant of the script that runs `cd /d S:\project\go\tomato_time\desktop\src-tauri` then `cargo check --release` instead of `npm run tauri -- build`. This catches Rust compile errors (e.g., WindowState generic R: Runtime requires `WindowState<tauri::Wry>` in commands and `manage::<WindowState<tauri::Wry>>`, and `WindowEvent::Moved` yields `&PhysicalPosition<i32>`). Only run the full `npm run tauri -- build` after cargo check and `npm run build` (frontend typecheck+vite) both pass.
3. Create a temporary cmd script that calls D:\TomatoBuild\VS2022\Common7\Tools\VsDevCmd.bat with -arch=x64 -host_arch=x64, sets RUSTUP_HOME=D:\TomatoBuild\Rust\rustup, CARGO_HOME=D:\TomatoBuild\Rust\cargo, CARGO_TARGET_DIR=D:\TomatoBuild\tomato-time-target, TEMP/TMP=D:\TomatoBuild\Temp, prepends C:\Users\leizh\.cargo\bin to PATH, then runs cd /d S:\project\go\tomato_time\desktop and npm run tauri -- build.
## Pitfalls
## Pitfalls
- Do not rely on C: for Visual Studio/Rust target caches; this machine has tight C: space.
- In Git Bash, PowerShell commands containing $variables must be single-quoted or the shell will expand them before PowerShell sees them.
- Tauri Windows builds fail with `icons/icon.ico` not found if desktop/src-tauri/icons/icon.ico is missing, even when the installer icon option is unset.
- Avoid running git add concurrently with other git commands; it can leave an index.lock collision.
- keyring v3 must have `features = ["windows-native"]` explicitly set in Cargo.toml. Without it, `save_token` returns Ok but `get_token` fails after restart ("No matching entry"), causing the app to land on the login screen instead of the widget.
## Verification
3. Stop only the smoke-test process after inspection.
4. Optionally verify single-instance: launch a second copy of the exe while the first runs; the second process should exit cleanly (exit code 0) and only one tomato-time-desktop process should remain.