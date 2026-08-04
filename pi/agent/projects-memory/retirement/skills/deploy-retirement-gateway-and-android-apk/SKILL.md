---
name: "deploy-retirement-gateway-and-android-apk"
description: "Deploy the retirement Gateway to the Ubuntu test server and produce a real-device Android APK through HBuilderX cloud packaging."
version: 4
created: "2026-07-28"
updated: "2026-08-03"
---
## When to Use
Use when deploying the retirement backend to its Ubuntu test server and building an installable Android APK against the public Gateway. Do not use this procedure for formal production release without HTTPS, dedicated DCloud AppID, signing, backup, and secret rotation.

## Procedure
1. Run the focused and full Go/frontend verification before deployment.
2. Treat the cloud-hosted PostgreSQL referenced by `.runtime/deploy/configs/gateway.yaml` as this project's pre-release integration database when the user asks to update the not-yet-live environment directly. Confirm the DSN is remote without printing it, create a custom-format `pg_dump` backup under `S:/code/retirement/retirement/.runtime/backups/database/`, verify its SHA-256, run the project Migrator, and verify the latest migration, permissions, tables, and tenant-scoped constraints. Never place retirement database backups under `%LOCALAPPDATA%` or elsewhere on `C:`.
3. Run PostgreSQL integration tests against that cloud DB only when their fixtures have exact test-only identifiers and cleanup is verified afterward. Register `db.Close` with `t.Cleanup` before later data cleanup callbacks so LIFO cleanup removes data while the connection is still open.
4. Cross-compile the Gateway with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64` and verify it is a static x86-64 ELF.
5. Deploy under `/opt/retirement/current` with a dedicated retirement system user. Keep JWT, DB DSN, ASR key, and attachment path in `/etc/retirement/gateway.env` mode 600; keep attachments under `/var/lib/retirement`.
6. Manage the process with `retirement-gateway.service`, enable restart, run migrations on startup, and expose TCP 7000 only for the test environment.
7. Verify `systemctl` active/enabled, localhost health, public health, tenant login, and a real ASR upload through the public Gateway. Probe a newly added route before packaging; a public `404` means the old binary is still running even if the database migration succeeded.
8. Set APP-PLUS BASE_URL to the public Gateway while leaving H5 development on localhost. Run UI tests and `npx uni build -p app`.
9. Use HBuilderX CLI cloud pack with an account-owned DCloud AppID, package `com.retirement.mobile`, Android cloud certificate type 3, and safemode true. Public test certificates are rejected for new apps.
10. Poll CLI pack status without resubmitting, download the APK to `retirement-app/.runtime`, then verify aapt badging, ZIP integrity, apksigner v1/v2 signatures, SHA-256, and the compiled public API address.
## Pitfalls
- The remote PostgreSQL port being reachable does not prove credentials are correct; validate the exact project DSN without logging it.
- Do not start a local Docker PostgreSQL merely because `RETIREMENT_TEST_DB_DSN` is unset when the user has designated the cloud database as the not-yet-live integration database. Use the existing deployment config securely and back it up first.
- A passing database migration does not deploy Gateway routes. Confirm the new public route does not return 404 before building or distributing an APK that depends on it.
- PostgreSQL integration cleanup registered with `t.Cleanup` runs after function defers; a deferred `db.Close` can therefore close the connection too early. Register connection close as an earlier cleanup so later fixture cleanup runs first.
- Windows PowerShell 5.1 lacks RandomNumberGenerator.GetBytes static helpers; use RandomNumberGenerator.Create with a byte array.
- HBuilderX cloud packing may first download uniapp-cli-vite and app-safe-pack; wait for installation, then retry.
- A manifest AppID of `__UNI__DEFAULT` cannot cloud pack. Temporarily reusing another account-owned AppID is acceptable only for immediate test builds; create a dedicated retirement AppID before formal release.
- DCloud public test certificates are unavailable for new apps; use cloud certificate type 3 or a dedicated self-owned certificate.
- The current cloud APK may contain only arm64-v8a and therefore cannot install on the x86 emulator. Validate on an arm64 physical phone.
- Do not confuse `npx uni build -p app` output with an APK; it is only app resources.
## Verification
1. curl the public /healthz endpoint and confirm code 0.
2. Authenticate a known tenant account through the public /api/v1/auth/login endpoint.
3. Upload a known speech WAV to /api/v1/ai/transcriptions and confirm a non-empty expected transcription.
4. Confirm aapt reports package com.retirement.mobile and the expected version.
5. Confirm apksigner reports Verifies with v1 and v2 schemes.
6. Run unzip -t and record the APK SHA-256.
7. Confirm the app-service.js build artifact contains the intended public API base URL.