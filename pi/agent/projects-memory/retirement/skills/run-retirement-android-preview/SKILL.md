---
name: "run-retirement-android-preview"
description: "Run and verify the retirement uni-app against the Go gateway in the local Android emulator."
version: 4
created: "2026-07-23"
updated: "2026-07-26"
---
## When to Use
Use when opening, rebuilding, or debugging S:/code/retirement/retirement-app on this machine's Android emulator.

## Procedure
1. Start only `S:/code/retirement/retirement/cmd/gateway-api` for mobile integration; it listens on port `7000`. For disposable runs set `RETIREMENT_DB_MODE=memory`. For persisted integration remove that variable and set `RETIREMENT_DB_DSN`; verify a known record count through the API before assuming the process uses PostgreSQL.
2. Start AVD `pi_mobile_api30_x86` with SDK `S:/tool/anzhuosdk` and `ANDROID_AVD_HOME=S:/tool/android-avd`; verify API 30, x86, and 4096-byte pages.
3. Use HBuilderX `S:/tool/hbuilderx/HBuilderX` version 5.14. Keep `@dcloudio` compiler packages at `3.0.0-5010420260703001` and Vite `5.2.8`.
4. Import the project with `cli.exe project open --path S:/code/retirement/retirement-app`, then run `cli.exe launch app-android --project S:/code/retirement/retirement-app --deviceId emulator-5554 --playground standard --native-log false`.
5. Use `http://10.0.2.2:7000/api/v1` for APP-PLUS emulator builds and `http://127.0.0.1:7000/api/v1` for host-side builds.
6. Tenant login uses phone or platform identifier plus password. The showcase administrator is `13800000000 / admin123`; no tenant-code field is used.
## Pitfalls
- Do not open the uni-app source as if it were a Gradle Android application; Android Studio is used for SDK/emulator management while HBuilderX compiles and syncs the app.
- Do not use x86_64 or 16KB AVDs with the HBuilderX 5.14 standard base.
- A Gateway started in a short-lived Bash background process may be terminated when the shell exits; run it from the IDE or as a detached Windows process.
- A directly attached `cli.exe launch app-android` session may stop and leave the emulator in `PullDebugActivity` when the harness closes the process. For persistent visual verification, launch `cli.exe` with PowerShell `Start-Process`, redirect stdout/stderr into `.runtime`, then poll `dumpsys window` until `PandoraEntryActivity` is focused.
- In Git Bash, prefix adb commands that contain Android absolute paths such as `/sdcard/...` with `MSYS_NO_PATHCONV=1`; otherwise MSYS rewrites the device path into a host drive path.
- If port 7000 reports bind failure, inspect the existing process first and retain it when API record counts prove it already uses the intended database.
- Compiler 5.21 with the 5.14 mobile base shows a runtime mismatch dialog; align the DCloud packages instead of ignoring it permanently.
- If the HBuilder Activity and UI hierarchy are present but `adb screencap` is entirely black, first capture the Android home screen. A visible home screen isolates the failure to the HBuilder WebView. Force-stop only `io.dcloud.HBuilder` and relaunch the project to recreate its graphics context; do not restart the Gateway or emulator unless that fails.
- HBuilder hot reload can observe a file during another process's non-atomic save and briefly report an empty Vue component. Check that the file is stable, rerun the App build, then relaunch instead of restoring or reverting valid concurrent edits.
## Verification
1. curl http://127.0.0.1:7000/healthz returns code 0 and status ok.
2. npx uni build -p app reports compiler 5.14 and creates dist/build/app/app-service.js, app-config.js, manifest.json, and app.css.
3. HBuilderX logs show compile success, file sync success, and application started.
4. The emulator shows the retirement login or administrator home page with no HTML5+ version dialog or network error.