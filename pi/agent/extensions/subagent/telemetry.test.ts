import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeSubagentAttemptSpans,
  createSubagentTimingTracker,
  finishSubagentTiming,
  formatSubagentTiming,
  observeSubagentEvent,
  recordSubagentRetry,
} from "./telemetry.js";

describe("subagent telemetry", () => {
  it("records queue, startup, first token, model, tool, retry, and total timing", () => {
    const tracker = createSubagentTimingTracker(1000, 1200);

    observeSubagentEvent(tracker, { type: "session" }, 1300);
    observeSubagentEvent(tracker, { type: "message_start", message: { role: "assistant" } }, 1400);
    observeSubagentEvent(
      tracker,
      {
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: { type: "text_delta", delta: "hello" },
      },
      1450,
    );
    observeSubagentEvent(tracker, { type: "message_end", message: { role: "assistant" } }, 1600);
    observeSubagentEvent(tracker, { type: "tool_execution_start", toolCallId: "tool-1" }, 1650);
    observeSubagentEvent(tracker, { type: "tool_execution_end", toolCallId: "tool-1" }, 1750);
    recordSubagentRetry(tracker, 500);
    observeSubagentEvent(tracker, { type: "message_start", message: { role: "assistant" } }, 2000);
    observeSubagentEvent(tracker, { type: "message_end", message: { role: "assistant" } }, 2200);

    assert.deepEqual(finishSubagentTiming(tracker, 2500, 2), {
      queuedMs: 200,
      startupMs: 100,
      firstTokenMs: 250,
      modelMs: 400,
      toolMs: 100,
      retryDelayMs: 500,
      totalMs: 1500,
      attempts: 2,
    });
  });

  it("closes abrupt attempt spans before retry delay", () => {
    const tracker = createSubagentTimingTracker(1000, 1000);
    observeSubagentEvent(tracker, { type: "message_start", message: { role: "assistant" } }, 1100);
    closeSubagentAttemptSpans(tracker, 1200);
    recordSubagentRetry(tracker, 500);
    observeSubagentEvent(tracker, { type: "message_start", message: { role: "assistant" } }, 1800);
    observeSubagentEvent(tracker, { type: "message_end", message: { role: "assistant" } }, 1900);

    const timing = finishSubagentTiming(tracker, 2000, 2);
    assert.equal(timing.modelMs, 200);
    assert.equal(timing.retryDelayMs, 500);
  });

  it("closes active model and tool spans when a process exits abruptly", () => {
    const tracker = createSubagentTimingTracker(1000, 1000);
    observeSubagentEvent(tracker, { type: "message_start", message: { role: "assistant" } }, 1100);
    observeSubagentEvent(tracker, { type: "tool_execution_start", toolCallId: "tool-1" }, 1200);

    const timing = finishSubagentTiming(tracker, 1500, 1);
    assert.equal(timing.modelMs, 400);
    assert.equal(timing.toolMs, 300);
    assert.equal(timing.firstTokenMs, undefined);
  });

  it("formats compact timing without missing optional fields", () => {
    assert.equal(
      formatSubagentTiming({
        queuedMs: 200,
        startupMs: 1000,
        firstTokenMs: 2500,
        modelMs: 4000,
        toolMs: 500,
        retryDelayMs: 0,
        totalMs: 8000,
        attempts: 1,
      }),
      "queue:0.2s start:1.0s first:2.5s model:4.0s tools:0.5s total:8.0s",
    );
    assert.equal(
      formatSubagentTiming({
        queuedMs: 0,
        startupMs: undefined,
        firstTokenMs: undefined,
        modelMs: 0,
        toolMs: 0,
        retryDelayMs: 500,
        totalMs: 600,
        attempts: 2,
      }),
      "retry:0.5s total:0.6s attempts:2",
    );
  });
});
