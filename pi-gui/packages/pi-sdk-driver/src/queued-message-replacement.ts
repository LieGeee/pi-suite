import type { SessionQueuedMessage } from "@pi-gui/session-driver/types";

export function retainPendingQueuedMessages(
  currentPending: readonly SessionQueuedMessage[],
  requestedReplacement: readonly SessionQueuedMessage[],
): SessionQueuedMessage[] {
  const pendingIds = new Set(currentPending.map((message) => message.id));
  return requestedReplacement.filter((message) => pendingIds.has(message.id));
}
