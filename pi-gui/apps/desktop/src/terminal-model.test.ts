import assert from "node:assert/strict";
import test from "node:test";
import { appendTerminalReplayChunks } from "./terminal-model";

test("appendTerminalReplayChunks appends chunks in order", () => {
  const next = appendTerminalReplayChunks("a", ["b", "c"], false);
  assert.equal(next.replay, "abc");
  assert.equal(next.truncated, false);
});

test("appendTerminalReplayChunks leaves replay unchanged for no chunks", () => {
  const next = appendTerminalReplayChunks("a", [], true);
  assert.equal(next.replay, "a");
  assert.equal(next.truncated, true);
});
