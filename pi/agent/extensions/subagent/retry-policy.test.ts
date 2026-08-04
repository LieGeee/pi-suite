import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRetryDelayMs, runWithSubagentRetry, shouldRetrySubagent } from "./retry-policy.js";

describe("subagent retry policy", () => {
  it("retries one transient provider or stream failure for read-only work", () => {
    for (const errorMessage of [
      "429 Too Many Requests",
      "500 Internal Server Error",
      "502 Bad Gateway",
      "503 Service temporarily unavailable",
      "504 Gateway Timeout",
      "stream_read_error",
      "ECONNRESET",
      "socket hang up",
      "premature close",
      "404 模型 gpt-5.6-luna 在上游组 44 不可用",
      "upstream group 7 unavailable",
    ]) {
      assert.equal(
        shouldRetrySubagent({
          permission: "read",
          attempt: 1,
          exitCode: 1,
          errorMessage,
          stderr: "",
        }),
        true,
        errorMessage,
      );
    }
  });

  it("does not retry mutating, exhausted, timeout, abort, or validation failures", () => {
    const transient = {
      attempt: 1,
      exitCode: 1,
      errorMessage: "503 Service temporarily unavailable",
      stderr: "",
    } as const;
    assert.equal(shouldRetrySubagent({ ...transient, permission: "exec" }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "write" }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "read", attempt: 2 }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "read", exitCode: 124, errorMessage: "Subagent timed out after 120 seconds." }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "read", errorMessage: "Subagent was aborted" }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "read", errorMessage: "Unknown agent: reviewer" }), false);
    assert.equal(shouldRetrySubagent({ ...transient, permission: "read", exitCode: 0, errorMessage: "" }), false);
  });

  it("runs one delayed retry for read-only work and returns retry history", async () => {
    let calls = 0;
    const slept: number[] = [];
    const outcome = await runWithSubagentRetry(
      "read",
      async () => {
        calls++;
        return calls === 1
          ? { exitCode: 1, errorMessage: "503 Service temporarily unavailable", stderr: "" }
          : { exitCode: 0, errorMessage: undefined, stderr: "" };
      },
      {
        random: () => 0,
        sleep: async (milliseconds) => {
          slept.push(milliseconds);
        },
      },
    );

    assert.equal(calls, 2);
    assert.deepEqual(slept, [500]);
    assert.equal(outcome.attempts, 2);
    assert.equal(outcome.retryDelayMs, 500);
    assert.deepEqual(outcome.retryErrors, ["503 Service temporarily unavailable"]);
    assert.equal(outcome.result.exitCode, 0);
  });

  it("aborts immediately during retry delay without starting another attempt", async () => {
    let calls = 0;
    const controller = new AbortController();
    const pending = runWithSubagentRetry(
      "read",
      async () => {
        calls++;
        return { exitCode: 1, errorMessage: "503 Service temporarily unavailable", stderr: "" };
      },
      { random: () => 0, signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort();
    await assert.rejects(pending, (error: Error) => error.name === "AbortError");
    assert.equal(calls, 1);
  });

  it("does not replay a write attempt", async () => {
    let calls = 0;
    const outcome = await runWithSubagentRetry("write", async () => {
      calls++;
      return { exitCode: 1, errorMessage: "503 Service temporarily unavailable", stderr: "" };
    });

    assert.equal(calls, 1);
    assert.equal(outcome.attempts, 1);
    assert.equal(outcome.retryDelayMs, 0);
  });

  it("uses bounded retry jitter", () => {
    assert.equal(getRetryDelayMs(() => 0), 500);
    assert.equal(getRetryDelayMs(() => 0.5), 1000);
    assert.equal(getRetryDelayMs(() => 1), 1500);
    assert.equal(getRetryDelayMs(() => -1), 500);
    assert.equal(getRetryDelayMs(() => 2), 1500);
  });
});
