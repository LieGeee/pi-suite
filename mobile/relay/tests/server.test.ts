import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import WebSocket from "ws";
import { createRelayHttpServer } from "../src/server.js";
import { RelayStore } from "../src/store.js";
import type { RelayEnvelope } from "../src/protocol.js";

test("HTTP API creates pair tokens and WebSocket endpoints relay desktop/mobile messages", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "server-test" });
  const app = createRelayHttpServer({ store });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsUrl = `ws://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json()) as { ok?: boolean };
    assert.equal(health.ok, true);

    const created = await fetch(`${baseUrl}/api/pair/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "desktop" }),
    }).then((response) => response.json()) as { pairToken?: string };
    assert.equal(typeof created.pairToken, "string");
    const pairToken = created.pairToken!;

    const desktop = new WebSocket(`${wsUrl}/ws/desktop`);
    const mobile = new WebSocket(`${wsUrl}/ws/mobile`);
    await Promise.all([once(desktop, "open"), once(mobile, "open")]);
    const desktopMessages: RelayEnvelope[] = [];
    const mobileMessages: RelayEnvelope[] = [];
    desktop.on("message", (data) => desktopMessages.push(JSON.parse(data.toString()) as RelayEnvelope));
    mobile.on("message", (data) => mobileMessages.push(JSON.parse(data.toString()) as RelayEnvelope));

    desktop.send(JSON.stringify({
      type: "desktop.hello",
      payload: { version: 1, pairToken, permissions: { taskList: true, sendMessages: true } },
    }));
    await waitForMessage(desktopMessages, "server.ready");
    desktop.send(JSON.stringify({ type: "desktop.snapshot", payload: { workspaces: [{ id: "w1" }] } }));

    mobile.send(JSON.stringify({ type: "mobile.hello", payload: { pairToken, deviceName: "phone" } }));
    await waitForMessage(mobileMessages, "server.ready");
    const diagnostics = await fetch(`${baseUrl}/api/pair/diagnostics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairToken }),
    }).then((response) => response.json()) as {
      ok?: boolean;
      desktopOnline?: boolean;
      mobileOnlineCount?: number;
      hasLatestSnapshot?: boolean;
      lastEnvelopeTypes?: string[];
    };
    assert.equal(diagnostics.ok, true);
    assert.equal(diagnostics.desktopOnline, true);
    assert.equal(diagnostics.mobileOnlineCount, 1);
    assert.equal(diagnostics.hasLatestSnapshot, true);
    assert.deepEqual(diagnostics.lastEnvelopeTypes, ["desktop.hello", "desktop.snapshot", "mobile.hello"]);

    const cachedSnapshot = await waitForMessage(mobileMessages, "server.snapshot");
    assert.deepEqual(cachedSnapshot.payload, {
      type: "desktop.snapshot",
      payload: { workspaces: [{ id: "w1" }] },
    });

    mobile.send(JSON.stringify({
      type: "mobile.command",
      commandId: "cmd-server-1",
      command: "command.sendMessage",
      payload: { workspaceId: "w1", sessionId: "s1", text: "继续" },
    }));
    const forwarded = await waitForMessage(desktopMessages, "mobile.command");
    assert.equal(forwarded.commandId, "cmd-server-1");

    desktop.close();
    mobile.close();
  } finally {
    await app.close();
  }
});

async function waitForMessage(messages: readonly RelayEnvelope[], type: string): Promise<RelayEnvelope> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const message = messages.find((candidate) => candidate.type === type);
    if (message) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${type}; saw ${messages.map((message) => message.type).join(", ")}`);
}
