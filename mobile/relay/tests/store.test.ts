import assert from "node:assert/strict";
import { test } from "node:test";
import { RelayStore } from "../src/store.js";

test("RelayStore creates pairings without storing raw tokens and verifies them", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "test-salt" });
  try {
  const created = store.createPairing({ label: "desktop" });

  assert.equal(typeof created.pairToken, "string");
  assert.equal(created.pairToken.length > 20, true);
  assert.equal(store.verifyPairToken(created.pairToken)?.id, created.id);
  assert.equal(store.findRawTokenLeak(created.pairToken), false);
  } finally { store.close(); }
});

test("RelayStore stores latest snapshots and bounded recent notifications", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "test-salt", notificationRetention: 2 });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const pairing = store.verifyPairToken(pairToken);
  assert.ok(pairing);

  store.saveLatestSnapshot(pairing.id, { type: "desktop.snapshot", payload: { workspaces: [{ id: "w1" }] } });
  assert.deepEqual(store.getLatestSnapshot(pairing.id), {
    type: "desktop.snapshot",
    payload: { workspaces: [{ id: "w1" }] },
  });

  store.saveNotification(pairing.id, { type: "desktop.notification", payload: { title: "one" } });
  store.saveNotification(pairing.id, { type: "desktop.notification", payload: { title: "two" } });
  store.saveNotification(pairing.id, { type: "desktop.notification", payload: { title: "three" } });
  assert.deepEqual(store.getRecentNotifications(pairing.id).map((item) => (item.payload as { title?: string } | undefined)?.title), ["two", "three"]);
  } finally { store.close(); }
});

test("RelayStore records command ids once for dedupe", async () => {
  const store = await RelayStore.openMemory({ tokenSalt: "test-salt" });
  try {
  const { pairToken } = store.createPairing({ label: "desktop" });
  const pairing = store.verifyPairToken(pairToken);
  assert.ok(pairing);

  assert.equal(store.recordCommand(pairing.id, "cmd-1", "command.sendMessage"), true);
  assert.equal(store.recordCommand(pairing.id, "cmd-1", "command.sendMessage"), false);
  } finally { store.close(); }
});
