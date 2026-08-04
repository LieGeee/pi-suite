import assert from "node:assert/strict";
import test from "node:test";
import type { SessionMessageInput, SessionQueuedMessage, SessionRef } from "@pi-gui/session-driver";
import { submitNewQueuedMessage } from "./queued-message-submission.ts";

const ref: SessionRef = { workspaceId: "workspace", sessionId: "session" };
const message: SessionQueuedMessage = {
  id: "new-message",
  mode: "followUp",
  text: "只发送这条新消息",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

test("new queued messages are submitted incrementally", async () => {
  const sent: SessionMessageInput[] = [];
  let replacementCalls = 0;
  await submitNewQueuedMessage({
    async sendUserMessage(_ref, input) { sent.push(input); },
    async replaceQueuedMessages() { replacementCalls += 1; },
  }, ref, message);
  assert.equal(replacementCalls, 0);
  assert.deepEqual(sent, [{ queuedMessageId: "new-message", text: "只发送这条新消息", deliverAs: "followUp" }]);
});
