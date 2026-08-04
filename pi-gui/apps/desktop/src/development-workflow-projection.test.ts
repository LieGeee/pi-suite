import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TranscriptMessage } from "./desktop-state";
import { projectDevelopmentWorkflowOutputs } from "./development-workflow-projection";

function assistantMessage(id: string, text: string): TranscriptMessage {
  return {
    kind: "message",
    id,
    role: "assistant",
    text,
    createdAt: new Date().toISOString(),
  };
}

test("projectDevelopmentWorkflowOutputs returns bounded role outputs from recent assistant messages", () => {
  const transcript: TranscriptMessage[] = [
    assistantMessage("old", "[Architect] old text that should be ignored"),
    assistantMessage("dev", `[Developer] ${"x".repeat(64)}`),
    assistantMessage("review", "[Reviewer] short review"),
  ];

  const projection = projectDevelopmentWorkflowOutputs(transcript, {
    maxMessages: 2,
    maxTextPerMessage: 80,
    maxTextPerRole: 16,
  });

  assert.equal(projection.outputs.length, 2);
  assert.equal(projection.outputCount, 2);
  assert.equal(projection.outputs.some((output) => output.role === "Architect"), false);
  assert.equal(projection.outputs.find((output) => output.role === "Reviewer")?.text, "short review");
  const developer = projection.outputs.find((output) => output.role === "Developer");
  assert.ok(developer);
  assert.ok(developer.text.length < 80);
  assert.equal(developer.truncated, true);
});
