import assert from "node:assert/strict";
import test from "node:test";
import type { SessionQueuedMessage } from "@pi-gui/session-driver";
import { retainPendingQueuedMessages } from "../src/queued-message-replacement.ts";
const message = (id: string, text = id): SessionQueuedMessage => ({ id, mode: "followUp", text, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" });
test("does not resurrect an already-started queued message", () => {
  assert.deepEqual(retainPendingQueuedMessages([message("pending")], [message("started"), message("pending", "edited")]), [message("pending", "edited")]);
});
