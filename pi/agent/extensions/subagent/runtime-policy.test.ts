import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySubagentExit,
  getDeclaredSubagentStatus,
  getFinalAssistantText,
  hasFailedSubagentResults,
  resolveSubagentTimeoutSeconds,
} from "./runtime-policy.js";

describe("subagent runtime policy", () => {
  it("uses short read timeouts and longer execution timeouts by default", () => {
    assert.equal(resolveSubagentTimeoutSeconds("read"), 120);
    assert.equal(resolveSubagentTimeoutSeconds("exec"), 300);
    assert.equal(resolveSubagentTimeoutSeconds("write"), 300);
    assert.equal(resolveSubagentTimeoutSeconds("read", 45), 45);
  });

  it("rejects timeout values outside the supported range", () => {
    assert.throws(() => resolveSubagentTimeoutSeconds("read", 4), /between 5 and 1800/);
    assert.throws(() => resolveSubagentTimeoutSeconds("write", 1801), /between 5 and 1800/);
  });

  it("turns a timeout into an explicit failed result", () => {
    assert.deepEqual(
      classifySubagentExit({
        exitCode: 0,
        finalOutput: "",
        stderr: "",
        timedOut: true,
        timeoutSeconds: 120,
      }),
      {
        exitCode: 124,
        stopReason: "error",
        errorMessage: "Subagent timed out after 120 seconds.",
      },
    );
  });

  it("reports a zero-text child exit instead of treating it as success", () => {
    assert.deepEqual(
      classifySubagentExit({
        exitCode: 0,
        finalOutput: "",
        stderr: "",
        timedOut: false,
        timeoutSeconds: 120,
      }),
      {
        exitCode: 1,
        stopReason: "error",
        errorMessage: "Subagent exited without a final assistant text response.",
      },
    );
  });

  it("joins every text part from the final assistant message", () => {
    assert.equal(
      getFinalAssistantText([
        {
          role: "assistant",
          content: [
            { type: "text", text: "first" },
            { type: "thinking", text: "hidden" },
            { type: "text", text: "second" },
          ],
        },
      ]),
      "first\nsecond",
    );
  });

  it("does not reuse stale text when the final assistant turn only calls a tool", () => {
    assert.equal(
      getFinalAssistantText([
        { role: "assistant", content: [{ type: "text", text: "Starting" }] },
        { role: "assistant", content: [{ type: "toolCall", name: "read" }] },
        { role: "toolResult", content: [{ type: "text", text: "file" }] },
      ]),
      "",
    );
  });

  it("detects failed structured child results without treating running placeholders as failures", () => {
    assert.equal(
      hasFailedSubagentResults({
        results: [
          { exitCode: 0, stopReason: "stop" },
          { exitCode: -1 },
        ],
      }),
      false,
    );
    assert.equal(hasFailedSubagentResults({ results: [{ exitCode: 1 }] }), true);
    assert.equal(hasFailedSubagentResults({ results: [{ exitCode: 0, stopReason: "error" }] }), true);
    assert.equal(hasFailedSubagentResults({ results: [{ exitCode: 0, errorMessage: "stream_read_error" }] }), true);
    assert.equal(hasFailedSubagentResults(undefined), false);
  });

  it("extracts structured final agent statuses", () => {
    assert.equal(getDeclaredSubagentStatus("## Status\nDONE"), "DONE");
    assert.equal(getDeclaredSubagentStatus("## Status: DONE_WITH_CONCERNS"), "DONE_WITH_CONCERNS");
    assert.equal(getDeclaredSubagentStatus("  \n## Status\nNEEDS_CONTEXT\nmore"), "NEEDS_CONTEXT");
    // Preamble before the Status block must not hide a failure declaration.
    assert.equal(getDeclaredSubagentStatus("Summary of work.\n## Status\nBLOCKED"), "BLOCKED");
    assert.equal(getDeclaredSubagentStatus("Done with the task.\n\n## Status: BLOCKED\n"), "BLOCKED");
    assert.equal(getDeclaredSubagentStatus("## Status\nDONE\ndone with details"), "DONE");
    // Prose mentioning a status without the heading must not count.
    assert.equal(getDeclaredSubagentStatus("The task may be blocked by config."), undefined);
    assert.equal(getDeclaredSubagentStatus("## Status Report\nall good"), undefined);
    // A quoted example inside a code fence must not count.
    assert.equal(
      getDeclaredSubagentStatus("Example:\n```\n## Status\nBLOCKED\n```\nReal status:\n## Status\nDONE"),
      "DONE",
    );
    // The last outside-fence declaration wins.
    assert.equal(
      getDeclaredSubagentStatus("## Status\nDONE\n## Status\nBLOCKED\n## Status: DONE_WITH_CONCERNS"),
      "DONE_WITH_CONCERNS",
    );
    // A code-fence BLOCKED example alone yields no status.
    assert.equal(getDeclaredSubagentStatus("```\n## Status\nBLOCKED\n```"), undefined);
  });

  it("turns structured BLOCKED and NEEDS_CONTEXT responses into failed results", () => {
    for (const status of ["BLOCKED", "NEEDS_CONTEXT"] as const) {
      assert.deepEqual(
        classifySubagentExit({
          exitCode: 0,
          finalOutput: `## Status\n${status}`,
          stderr: "",
          timedOut: false,
          timeoutSeconds: 120,
        }),
        {
          exitCode: 1,
          stopReason: "error",
          errorMessage: `Subagent reported ${status}.`,
        },
      );
    }
  });

  it("preserves successful child results", () => {
    assert.deepEqual(
      classifySubagentExit({
        exitCode: 0,
        finalOutput: "DONE",
        stderr: "",
        timedOut: false,
        timeoutSeconds: 120,
      }),
      { exitCode: 0 },
    );
  });
});
