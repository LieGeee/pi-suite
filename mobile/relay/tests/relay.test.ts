import assert from "node:assert/strict";
import { test } from "node:test";
import { RelayHub, type RelayPeer } from "../src/relay.js";
import { RelayStore } from "../src/store.js";
import type { RelayEnvelope } from "../src/protocol.js";

class MemoryPeer implements RelayPeer {
  readonly sent: RelayEnvelope[] = [];
  closed = false;

  sendEnvelope(envelope: RelayEnvelope): void {
    this.sent.push(envelope);
  }

  close(): void {
    this.closed = true;
  }
}

test("RelayHub authenticates desktop/mobile and forwards cached desktop snapshot to mobile", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "relay-test" });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const hub = new RelayHub(store);
  const desktop = new MemoryPeer();
  const mobile = new MemoryPeer();

  hub.attachDesktop(desktop);
  hub.receive(desktop, {
    type: "desktop.hello",
    payload: {
      version: 1,
      pairToken,
      permissions: { taskList: true, sendMessages: true },
    },
  });
  hub.receive(desktop, { type: "desktop.snapshot", payload: { workspaces: [{ id: "w1" }] } });

  hub.attachMobile(mobile);
  hub.receive(mobile, { type: "mobile.hello", payload: { pairToken, deviceName: "phone" } });

  assert.equal(desktop.sent.some((message) => message.type === "server.ready"), true);
  assert.equal(mobile.sent.some((message) => message.type === "server.ready"), true);
  assert.deepEqual(mobile.sent.find((message) => message.type === "server.snapshot")?.payload, {
    type: "desktop.snapshot",
    payload: { workspaces: [{ id: "w1" }] },
  });
  } finally { store.close(); }
});

test("RelayHub reports room diagnostics for a pair token", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "relay-test" });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const hub = new RelayHub(store);
  const desktop = new MemoryPeer();
  const mobile = new MemoryPeer();

  hub.attachDesktop(desktop);
  hub.receive(desktop, {
    type: "desktop.hello",
    payload: { version: 1, pairToken, permissions: { taskList: true, sendMessages: false } },
  });
  hub.receive(desktop, { type: "desktop.snapshot", payload: { workspaces: [{ id: "w1" }] } });
  hub.attachMobile(mobile);
  hub.receive(mobile, { type: "mobile.hello", payload: { pairToken, deviceName: "phone" } });

  const diagnostics = hub.inspectPairToken(pairToken);

  assert.equal(diagnostics.ok, true);
  assert.equal(diagnostics.desktopOnline, true);
  assert.equal(diagnostics.mobileOnlineCount, 1);
  assert.equal(diagnostics.hasLatestSnapshot, true);
  assert.deepEqual(diagnostics.lastEnvelopeTypes, ["desktop.hello", "desktop.snapshot", "mobile.hello"]);
  assert.equal(JSON.stringify(diagnostics).includes(pairToken), false);
  } finally { store.close(); }
});

test("RelayHub forwards permitted mobile commands to the online desktop and dedupes commandId", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "relay-test" });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const hub = new RelayHub(store);
  const desktop = new MemoryPeer();
  const mobile = new MemoryPeer();

  hub.attachDesktop(desktop);
  hub.receive(desktop, {
    type: "desktop.hello",
    payload: { version: 1, pairToken, permissions: { taskList: true, sendMessages: true } },
  });
  hub.attachMobile(mobile);
  hub.receive(mobile, { type: "mobile.hello", payload: { pairToken } });

  const command = {
    type: "mobile.command",
    commandId: "cmd-1",
    command: "command.sendMessage",
    payload: { workspaceId: "w1", sessionId: "s1", text: "继续" },
  } as const;
  hub.receive(mobile, command);
  hub.receive(mobile, command);

  assert.equal(desktop.sent.filter((message) => message.type === "mobile.command").length, 1);
  assert.equal(mobile.sent.some((message) => message.type === "command.failed" && (message.payload as { commandId?: string }).commandId === "cmd-1"), true);
  } finally { store.close(); }
});

test("RelayHub rejects invalid tokens, offline desktop commands, and disabled permissions", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "relay-test" });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const hub = new RelayHub(store);

  const invalid = new MemoryPeer();
  hub.attachMobile(invalid);
  hub.receive(invalid, { type: "mobile.hello", payload: { pairToken: "bad-token" } });
  assert.equal(invalid.sent[0]?.type, "server.authFailed");
  assert.equal(invalid.closed, true);

  const mobile = new MemoryPeer();
  hub.attachMobile(mobile);
  hub.receive(mobile, { type: "mobile.hello", payload: { pairToken } });
  hub.receive(mobile, {
    type: "mobile.command",
    commandId: "cmd-offline",
    command: "command.sendMessage",
    payload: { text: "hi" },
  });
  assert.equal((mobile.sent.at(-1)?.payload as { error?: string }).error, "桌面端不在线");

  const desktop = new MemoryPeer();
  hub.attachDesktop(desktop);
  hub.receive(desktop, { type: "desktop.hello", payload: { version: 1, pairToken, permissions: { sendMessages: false } } });
  hub.receive(mobile, {
    type: "mobile.command",
    commandId: "cmd-denied",
    command: "command.sendMessage",
    payload: { text: "hi" },
  });
  assert.equal((mobile.sent.at(-1)?.payload as { error?: string }).error, "移动端没有发送消息权限");
  } finally { store.close(); }
});
