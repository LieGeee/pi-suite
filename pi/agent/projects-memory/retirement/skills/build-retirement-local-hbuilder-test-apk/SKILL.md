---
name: "build-retirement-local-hbuilder-test-apk"
description: "Build a locally signed retirement Android test APK by embedding uni-app resources into the HBuilderX 5.14 standard base."
version: 5
created: "2026-07-28"
updated: "2026-07-31"
---
## When to Use
Use when DCloud cloud safe packaging omits uni-app www resources or a quick local Android test APK is needed with plus.audio support. This produces a HBuilder standard-base test shell, not a formal independently branded release APK.

## Procedure
1. Run `npm run test:ui` and `npx uni build -p app`; verify `dist/build/app` contains `__uniappview.html`, `app-service.js`, `manifest.json`, and the intended public API URL.
2. For an unbranded emergency build, copy `HBuilderX/plugins/launcher/base/android_base.apk` and use .NET `ZipArchive` Update mode to replace only `assets/apps/HBuilder/www`, `dcloud_control.xml`, and old signature entries. Do not generically extract/recompress the base.
3. For a branded local build, decode the base with HBuilderX's bundled `plugins/app-safe-pack/apktool.jar` 2.11.1. Set default and Chinese `app_name` to `养老助手`; replace `drawable-ldpi` through `drawable-xxxhdpi/icon.png` with the project icons (36, 48, 72, 96, 144, 192 pixels).
4. Replace decoded `assets/apps/HBuilder/www` with `dist/build/app`, set its manifest ID to `HBuilder`, and update `assets/data/dcloud_control.xml` app version to match the embedded app.
5. Rebuild branded output with the bundled Apktool. Run Android build-tools `zipalign`, then sign with the local Android debug keystore through `apksigner.jar` using the HBuilderX or Android Studio Java runtime.
6. Verify ZIP integrity, `__uniappview.html`, v1/v2/v3 signatures, supported ABIs, SHA-256, public API URL, `application-label:养老助手`, all six launcher icon density paths, and that the APK's embedded `app-service.js` hash matches `dist/build/app/app-service.js`.
7. Uninstall the existing `io.dcloud.HBuilder` base from the emulator, install the local APK, handle the standard-base phone-state prompt, grant `RECORD_AUDIO`, and validate the branded app drawer entry plus login against the public Gateway.
8. Copy the verified artifact to `G:/cunchu/养老助手-本地实机测试.apk` and confirm its hash matches the project artifact.

## Pitfalls
- DCloud safemode cloud packaging can return a signed APK containing only `manifest.json` under `assets/apps` and then fail at runtime with a missing `__uniappview.html` page.
- Do not unpack and recreate the entire HBuilder base with `jar` or generic ZIP tooling. The base contains duplicate or obfuscated resources; recompression can make FileProvider XML resources unreadable and crash on startup.
- HBuilderX's bundled Apktool 2.11.1 can safely rebuild the base when launcher label or icon resources must change; use it instead of generic ZIP rebuilding for `resources.arsc` changes.
- Android build-tools 36.1 rejects `zipalign -P 16` combined with legacy `-p`. For 16 KB alignment use `zipalign -P 16 -f 4 input.apk output.apk`, then verify with `zipalign -c -P 16 -v 4 output.apk`.
- Do not validate a newly embedded `www` with `adb install -r`: the HBuilder standard base can continue using old extracted resources or an existing native View. Uninstall `io.dcloud.HBuilder` first, then install the APK cleanly.
- The branded local test APK still retains native package `io.dcloud.HBuilder`, broad standard-base permissions, native version 15.14, and debug signing. It is unsuitable for formal distribution.
- Canceling the standard-base device identifier explanation can close the app. Grant only permissions actually declared by the current base; `READ_PHONE_NUMBERS` may not be declared.
- Installing this APK replaces an existing HBuilder standard base because the package ID is shared.

## Verification
1. The APK contains `assets/apps/HBuilder/www/__uniappview.html` with non-zero size and its embedded app-service hash matches the App build output.
2. `apksigner verify` reports `Verifies` and valid v1/v2/v3 schemes.
3. `aapt` reports `arm64-v8a`, `armeabi-v7a`, and `x86` native code plus application label `养老助手`.
4. After a clean uninstall/install, the emulator renders the retirement login screen without `ERR_FILE_NOT_FOUND`, FileProvider fatal exceptions, or stale native overlays.
5. A real tenant login reaches a PostgreSQL-backed task/workbench through `http://x.x.x.x:7000`.
6. The public Gateway `/healthz` remains successful.
7. The copied `G:/cunchu/养老助手-本地实机测试.apk` hash matches `.runtime/retirement-app-1.0.0-local.apk`.