# pi-mobile-client

Mobile-first browser client for pi-gui mobile sync.

## Architecture

```text
pi-gui desktop <--WebSocket--> pi-mobile-relay <--WebSocket--> pi-mobile-client
```

The mobile client is a Vite + React SPA. It connects to `pi-mobile-relay` through `/ws/mobile`, sends `mobile.hello`, renders desktop task snapshots, requests conversation transcripts, and sends authorized task commands.

## Scripts

```bash
pnpm install
pnpm test
pnpm run build
pnpm dev
```

## Local Run

Start the relay server:

```bash
cd /s/tool/pi/pi-mobile-relay
HOST=0.0.0.0 PORT=8787 RELAY_DB_PATH=data/relay.sqlite PAIR_TOKEN_SALT=local-dev-salt pnpm start
```

Create a token:

```bash
curl -X POST http://127.0.0.1:8787/api/pair/create \
  -H "content-type: application/json" \
  -d '{"label":"phone"}'
```

Start a mock desktop:

```bash
PAIR_TOKEN=pi_xxx RELAY_URL=ws://127.0.0.1:8787/ws/desktop node /s/tool/pi/pi-mobile-relay/scripts/mock-desktop.mjs
```

Start the mobile web client:

```bash
cd /s/tool/pi/pi-mobile-client
pnpm exec vite --host 0.0.0.0 --port 5178
```

Open:

```text
http://127.0.0.1:5178
```

For a real phone on the same LAN, use the computer's LAN IP instead of `127.0.0.1`:

```text
http://<computer-lan-ip>:5178
```

In the UI, enter:

```text
服务器地址: ws://<relay-host>:8787/ws/mobile
配对 Token: pi_xxx
```

## Implemented UI

- Relay URL and pair-token connection form
- Connection status
- Task list grouped from desktop snapshot data
- Selected conversation panel
- Transcript request button
- Conversation transcript rendering
- Follow-up composer
- Stop task action
- Notification/error strip
- Local persistence for relay URL and pair token

## Protocol

The client sends:

```json
{
  "type": "mobile.hello",
  "payload": {
    "pairToken": "pi_xxx",
    "deviceName": "Mobile Web"
  }
}
```

Commands are sent as:

```json
{
  "type": "mobile.command",
  "commandId": "uuid",
  "command": "command.sendMessage",
  "payload": {
    "workspaceId": "...",
    "sessionId": "...",
    "text": "继续这个任务"
  }
}
```

Supported command helpers:

- `command.requestTranscript`
- `command.sendMessage`
- `command.stopRun`
- `command.createSession`
- `command.selectSession`

The client handles:

- `server.ready`
- `server.snapshot`
- `desktop.snapshot`
- `desktop.transcript`
- `desktop.notification`
- `server.notification`
- `command.completed`
- `command.failed`
- `server.authFailed`
