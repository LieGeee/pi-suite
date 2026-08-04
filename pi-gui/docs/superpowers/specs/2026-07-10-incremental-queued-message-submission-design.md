# Incremental queued-message submission design

## Problem

When a session is running, `submitComposer()` currently rebuilds the complete pending-message queue through `replaceQueuedMessages()`. The driver implements replacement by clearing Pi's queue and then re-enqueuing every message from the GUI snapshot. If Pi has already started an older queued message but the corresponding `queuedMessageStarted` event has not reached the GUI, the stale GUI snapshot contains that old message and replacement enqueues it a second time.

## Decision

New queued messages are submitted incrementally through `sendUserMessage()` with `deliverAs`. The queued message's GUI-generated ID is carried in `SessionMessageInput.queuedMessageId`, allowing the driver snapshot and optimistic steer timeline item to refer to the same logical message. Whole-queue replacement remains limited to explicit edit, delete, and steer-existing-message operations.

## Data flow

1. The renderer submits the current draft.
2. `app-store-composer.ts` constructs one `QueuedComposerMessage`.
3. For a new message, a focused helper invokes `driver.sendUserMessage()` with only that message's ID, text, attachments, and delivery mode.
4. `SessionSupervisor` appends that one message to its authoritative queue and calls Pi's `steer()` or `followUp()` once.
5. Session events refresh the GUI queue. A stale GUI copy of an already-started older message is never sent back to the driver.
6. Editing/deleting an existing queued message continues to call `replaceQueuedMessages()` because those operations intentionally mutate the complete pending queue.

## Error handling

The current composer rollback behavior remains: failed submissions restore the draft, attachments, and edit state. Optimistic steer timeline items are removed on failure. No transcript or session-history files are deleted or rewritten by the migration.

## Verification

- A focused Node regression test proves that submitting a new queued message invokes incremental `sendUserMessage()` with only the new message, even when an older GUI queue entry exists.
- The regression test also proves that editing an existing queued message still uses whole-queue replacement.
- Run desktop typecheck and relevant composer/queued-message core tests.
- Build the Windows package, replace the installed files only after closing pi-gui, launch the installed executable, and verify its packaged resources match the new build.
