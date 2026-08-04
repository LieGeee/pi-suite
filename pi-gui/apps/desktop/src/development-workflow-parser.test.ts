import assert from "node:assert/strict";
import test from "node:test";

import type { TranscriptMessage } from "./desktop-state";
import { parseAgentOutputs } from "./development-workflow-parser";

const createdAt = "2026-01-01T00:00:00.000Z";

function assistant(id: string, text: string): TranscriptMessage {
  return { kind: "message", id, role: "assistant", text, createdAt };
}

test("parseAgentOutputs limits scanned messages and output text per role", () => {
  const transcript = [
    assistant("old", `[Architect] ${"old".repeat(2_000)}`),
    assistant("recent", `[Developer] ${"recent".repeat(2_000)}`),
  ];

  const outputs = parseAgentOutputs(transcript, {
    maxMessages: 1,
    maxTextPerMessage: 500,
    maxTextPerRole: 120,
  });

  assert.equal(outputs.has("Architect"), false);
  const developer = outputs.get("Developer");
  assert.ok(developer);
  assert.ok(developer.text.length <= 160);
  assert.match(developer.text, /已截断/);
});

test("parseAgentOutputs still treats unlabeled assistant text as main output", () => {
  const outputs = parseAgentOutputs([
    assistant("main", "main coordinator output"),
  ], { maxMessages: 8, maxTextPerRole: 80 });

  assert.equal(outputs.get("Main")?.text, "main coordinator output");
});
