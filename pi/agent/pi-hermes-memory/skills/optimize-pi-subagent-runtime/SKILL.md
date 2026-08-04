---
name: "optimize-pi-subagent-runtime"
description: "Diagnose, modify, and verify the subprocess-based subagent extension in the user's S:/tool/pi runtime without reintroducing serial delegation or unsafe retries."
version: 17
created: "2026-07-31"
updated: "2026-08-04"
---
## When to Use
Use when the Pi subagent tool is slow, times out, overloads a provider, reports child failures as success, fails to launch on Windows, mis-parses Windows slash-command paths, or needs workflow/concurrency/output-bound changes under S:/tool/pi/agent/extensions/subagent.

## Procedure
16. A normal subagent tool call awaits all of its children, so it cannot let the parent make later tool calls during that invocation. When the parent must continue immediately, use the explicit `background: true` option with parallel tasks and explicitly non-overlapping files; it returns a job id and posts results via a `followUp` custom message. Genuine same-turn parent/child parallelism without background mode still requires emitting independent sibling main-agent tool calls in the same assistant response; only do this for read-only work or explicitly non-overlapping writes.
## Pitfalls
- A normal lone subagent tool invocation blocks the parent agent until it returns. Do not claim the parent will continue concurrently. Use `background: true` only with parallel tasks and explicitly non-overlapping paths when immediate parent continuation is required; background completion is delivered later through a follow-up message.
## Verification
7. A read-only live child smoke returns exitCode 0 with timing, a real tool-call smoke has one unique toolResult per toolCallId, and a `background: true` smoke returns immediately with `background.status === "running"` before its follow-up completes.