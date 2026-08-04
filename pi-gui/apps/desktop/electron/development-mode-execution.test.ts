import assert from "node:assert/strict";
import test from "node:test";

import { latestUserTextFromTranscript, shouldAutoLaunchSubagents } from "./development-mode-execution";

test("launches subagents on every message when configured", () => {
  assert.equal(shouldAutoLaunchSubagents("every-message", false), true);
  assert.equal(shouldAutoLaunchSubagents("every-message", true), true);
});

test("launches subagents only before the first user message by default", () => {
  assert.equal(shouldAutoLaunchSubagents(undefined, false), true);
  assert.equal(shouldAutoLaunchSubagents("first-message", false), true);
  assert.equal(shouldAutoLaunchSubagents(undefined, true), false);
  assert.equal(shouldAutoLaunchSubagents("first-message", true), false);
});

test("does not auto-launch subagents in manual mode", () => {
  assert.equal(shouldAutoLaunchSubagents("manual", false), false);
  assert.equal(shouldAutoLaunchSubagents("manual", true), false);
});

test("extracts the latest user text from transcript messages", () => {
  assert.equal(latestUserTextFromTranscript([
    { kind: "message", role: "user", text: "first", id: "1", createdAt: "2026-01-01T00:00:00.000Z" },
    { kind: "message", role: "assistant", text: "answer", id: "2", createdAt: "2026-01-01T00:00:01.000Z" },
    { kind: "activity", id: "a", createdAt: "2026-01-01T00:00:02.000Z", label: "status" },
    { kind: "message", role: "user", text: "latest", id: "3", createdAt: "2026-01-01T00:00:03.000Z" },
  ]), "latest");
});
