---
name: "run-hbuilderx-uniapp-android-emulator"
description: "Set up and verify a compatible Android emulator when HBuilderX standard-base UniApp runs stall on x86_64 or 16KB images."
version: 1
created: "2026-07-22"
updated: "2026-07-22"
---
## When to Use
Use when HBuilderX standard-base Android runs stall at PullDebugActivity, show Weex IPC spinWaitPeer timeouts, report unsupported x86_64, or fail on 16KB-page Android emulator images.

## Procedure
1. Inspect HBuilderX's bundled android_base.apk ABIs before choosing an emulator image; compare them with adb shell getprop ro.product.cpu.abi and ro.product.cpu.abilist.
2. For HBuilderX 5.14, use the Google APIs API 30 x86 image package system-images;android-30;google_apis;x86 when the bundled base has x86 but no x86_64.
3. Install Android command-line tools from Google's official repository, verify the archive checksum from repository2-3.xml, and place them under the SDK's cmdline-tools/latest directory.
4. Install platforms;android-30 and system-images;android-30;google_apis;x86 with sdkmanager.
5. Create a separate AVD with ANDROID_AVD_HOME set explicitly; keep modern x86_64 AVDs for packaged APK regression testing.
6. Boot the x86 AVD and verify API 30, primary ABI x86, and 4096-byte page size before launching HBuilderX.
7. Run HBuilderX CLI launch app-android with the project path, standard playground, and native logs enabled.

## Pitfalls
- Do not select Google Play x86_64, arm64, or 16KB-page images for HBuilderX 5.14 standard-base hot-run when android_base.apk lacks x86_64.
- A packaged APK may install successfully on an x86_64 emulator through ARM translation even when the HBuilderX standard base stalls; these are separate compatibility paths.
- avdmanager may print devices.xml warnings with newer command-line tools while still creating the AVD successfully; verify the generated config.ini instead of assuming failure.
- HBuilderX may warn that the active adb is not its bundled adb. Ignore this only if sync, restart, and hot refresh work; otherwise configure HBuilderX to use the same SDK adb.

## Verification
1. adb reports sys.boot_completed=1, ro.build.version.sdk=30, ro.product.cpu.abi=x86, and getconf PAGESIZE=4096.
2. HBuilderX logs report compile success, base installation or update success, file sync success, and 应用已启动.
3. dumpsys activity shows io.dcloud.HBuilder/io.dcloud.PandoraEntryActivity as the resumed activity.
4. Logcat contains no spinWaitPeer timeout, program alignment/page-size failure, UnsatisfiedLinkError, or fatal exception.
5. Capture and inspect an emulator screenshot showing the real UniApp page rather than PullDebugActivity.