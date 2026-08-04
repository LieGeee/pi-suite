---
name: debug-pi-gui-timeline-pinning
description: Use when pi-gui virtualized timelines jump, lose bottom pinning, collapse on reopen, or override user scrolling.
version: 1
created: 2026-07-17
updated: 2026-07-17
---
## When to Use
Use for failures in pi-gui's `apps/desktop/tests/core/timeline-pinning.spec.ts`, especially bottom gaps after streaming, transient row collapse after reopen, or user scroll-away being pulled back to the bottom.

## Procedure
1. Run the single failing Playwright test serially before changing code; parallel load can mask timing behavior.
2. Separate three values: logical transcript length, virtual window indices, and DOM scroll metrics (`scrollTop`, `scrollHeight`, `clientHeight`). Do not infer one from another.
3. For reopen collapse, sample the minimum frame and inspect transcript count plus virtual `startIndex/endIndex`. If the transcript is complete but the initial window is too small, preserve conservative height estimates and add a bounded minimum rendered-item buffer instead of globally lowering estimates.
4. For bottom gaps, inspect the marker effect before and after `scrollTimelineToBottom`. Global CSS `scroll-behavior: smooth` can cause repeated streaming alignments to restart instead of reaching the target. Internal auto pinning must be immediate; user-invoked jump-to-latest can remain smooth.
5. Treat upward wheel input as user intent: cancel deferred/exact bottom restoration before the scroll event, and stop queued rAF realignment once pinning is false.
6. Remove every diagnostic dataset/log before verification.

## Pitfalls
- Increasing pixel overscan can raise both baseline and failure thresholds without fixing the ratio.
- Lowering all row estimates may fix first-paint density but shrink total height later, clamping saved off-bottom positions to the bottom.
- A focused pinned-stream test can pass while away-stream or session-switch restore regresses; always run the full timeline spec.
- Do not rely on global smooth scrolling for internal state synchronization.

## Verification
Run desktop typecheck/build, then the full timeline spec. Confirm all scenarios pass: composer growth at bottom, remount, oversized rows, off-bottom session restore, long reopen stability, mid-thread composer growth, and pinned/away same-row streaming.