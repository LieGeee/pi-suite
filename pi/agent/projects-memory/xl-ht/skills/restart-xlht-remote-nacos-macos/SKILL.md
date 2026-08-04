---
name: restart-xlht-remote-nacos-macos
description: Use when checking or restarting xl-ht's remote Nacos at 192.168.x.x:29801 on the Mac mini.
version: 1
created: 2026-07-14
updated: 2026-07-14
---
## When to Use
Use when xl-ht Java services cannot reach Nacos at `192.168.x.x:29801`, especially after the Mac mini reboots.

## Procedure
1. Confirm the symptom externally:
   - TCP `192.168.x.x:29801`
   - `http://192.168.x.x:29801/nacos/v1/console/health/liveness`
2. Connect using the configured SSH alias: `ssh mac` (`[REDACTED]`).
3. Inspect before changing anything:
   - `pgrep -af 'nacos\.nacos'`
   - `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(29801|30801|30802)( |$)'`
   - `tail -100 ~/Services/nacos/logs/start.out`
4. Start the existing installation in standalone mode:
   - `cd ~/Services/nacos && ./bin/startup.sh -m standalone`
5. Poll local liveness until HTTP 200/`OK`, then independently verify from the workstation.

## Pitfalls
- The host is macOS, not Linux; do not use `systemctl` or the repo's Linux `nacos.service` file.
- `bin/startup.sh` defaults to cluster mode. Omitting `-m standalone` causes startup failure involving `UnknownHostException: jmenv.tbsite.net`.
- SSH guesses such as `root@...` or `leizh@...` fail; use alias `mac` and its dedicated key.
- Do not claim recovery based only on the startup script's immediate message; Nacos can exit asynchronously.

## Verification
Require all of the following:
- Remote process remains alive.
- Remote listeners exist on `29801`, `30801`, and `30802`.
- Local and external liveness/readiness endpoints return HTTP 200 with `OK`.
- `logs/start.out` contains `Nacos started successfully in stand alone mode` and no post-restart startup error.