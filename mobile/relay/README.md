# pi-mobile-relay

Standalone relay server for pi-gui desktop/mobile synchronization.

## Architecture

```text
pi-gui desktop  <--WebSocket-->  pi-mobile-relay  <--WebSocket/HTTPS-->  mobile client
```

The relay server forwards messages between paired desktop and mobile devices. It does **not** execute local tasks and does **not** store model keys or pi auth files.

## Environment

- `HOST`: HTTP bind host. Default: `127.0.0.1`.
- `PORT`: HTTP bind port. Default: `8787`.
- `RELAY_DB_PATH`: SQLite path. Default: `data/relay.sqlite`.
- `PAIR_TOKEN_SALT`: salt for token hashing. Default: development-only local salt.

## Scripts

```bash
pnpm install
pnpm run build
pnpm test
pnpm start
```

## API

- `GET /api/health`
- `POST /api/pair/create`
- `POST /api/pair/revoke`
- `GET /ws/desktop`
- `GET /ws/mobile`

Create a pairing token:

```bash
curl -X POST http://127.0.0.1:8787/api/pair/create \
  -H "content-type: application/json" \
  -d '{"label":"my desktop"}'
```

Revoke a pairing token:

```bash
curl -X POST http://127.0.0.1:8787/api/pair/revoke \
  -H "content-type: application/json" \
  -d '{"pairToken":"pi_xxx"}'
```

## WebSocket protocol

Desktop connects to `/ws/desktop` and first sends:

```json
{
  "type": "desktop.hello",
  "payload": {
    "version": 1,
    "pairToken": "pi_xxx",
    "permissions": {
      "taskList": true,
      "conversationDetails": true,
      "notifications": true,
      "sendMessages": false,
      "stopRuns": false,
      "createSessions": false
    }
  }
}
```

Mobile connects to `/ws/mobile` and first sends:

```json
{
  "type": "mobile.hello",
  "payload": {
    "pairToken": "pi_xxx",
    "deviceName": "iPhone"
  }
}
```

Forwarded desktop-to-mobile messages:

- `desktop.snapshot`
- `desktop.transcript`
- `desktop.notification`
- `desktop.heartbeat`
- `command.completed`
- `command.failed`

Forwarded mobile-to-desktop messages:

- `mobile.command`

Server messages:

- `server.ready`
- `server.snapshot`
- `server.notification`
- `server.authFailed`
- `server.error`

## Local mock flow

Terminal 1:

```bash
pnpm start
```

Terminal 2:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8787/api/pair/create \
  -H "content-type: application/json" \
  -d '{"label":"mock"}' | node -pe "JSON.parse(fs.readFileSync(0,'utf8')).pairToken")
PAIR_TOKEN=$TOKEN node scripts/mock-desktop.mjs
```

Terminal 3, reuse the same token:

```bash
PAIR_TOKEN=pi_xxx node scripts/mock-mobile.mjs
```

The mock mobile receives the cached desktop snapshot and sends a sample `command.sendMessage`. The mock desktop logs the command and returns `command.completed`.

## Security

Stored data:

- SHA-256 hash of pair tokens with salt
- latest task snapshot
- recent notifications
- command log for dedupe/audit

Never stored:

- raw pair token
- model API keys
- `auth.json`
- `.pi/settings.json`
- local file contents
