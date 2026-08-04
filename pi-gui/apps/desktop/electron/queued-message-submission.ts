import type { SessionDriver, SessionQueuedMessage, SessionRef } from "@pi-gui/session-driver";

export async function submitNewQueuedMessage(
  driver: Pick<SessionDriver, "sendUserMessage" | "replaceQueuedMessages">,
  sessionRef: SessionRef,
  message: SessionQueuedMessage,
  options: { readonly replacementQueue?: readonly SessionQueuedMessage[] } = {},
): Promise<void> {
  if (options.replacementQueue) {
    await driver.replaceQueuedMessages(sessionRef, options.replacementQueue);
    return;
  }
  await driver.sendUserMessage(sessionRef, {
    queuedMessageId: message.id,
    text: message.text,
    deliverAs: message.mode,
    ...(message.attachments ? { attachments: message.attachments } : {}),
  });
}
