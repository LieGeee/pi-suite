import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDelegationPolicy } from "./delegation-policy.js";

describe("subagent delegation policy", () => {
  it("allows automatic delegation only for two or more read-only parallel tasks", () => {
    assert.deepEqual(
      validateDelegationPolicy({ mode: "parallel", taskCount: 2, permissions: ["read", "read"] }),
      { ok: true },
    );

    assert.match(
      validateDelegationPolicy({ mode: "single", taskCount: 1, permissions: ["read"] }).reason ?? "",
      /explicit user request/i,
    );
    assert.match(
      validateDelegationPolicy({ mode: "chain", taskCount: 2, permissions: ["read", "read"] }).reason ?? "",
      /explicit user request/i,
    );
    assert.match(
      validateDelegationPolicy({ mode: "parallel", taskCount: 1, permissions: ["read"] }).reason ?? "",
      /at least two/i,
    );
    assert.match(
      validateDelegationPolicy({ mode: "parallel", taskCount: 2, permissions: ["read", "exec"] }).reason ?? "",
      /read-only/i,
    );
    assert.match(
      validateDelegationPolicy({ mode: "parallel", taskCount: 2, permissions: ["read", "write"] }).reason ?? "",
      /read-only/i,
    );
  });

  it("allows any supported mode and permission after an explicit user request", () => {
    assert.deepEqual(
      validateDelegationPolicy({
        mode: "single",
        taskCount: 1,
        permissions: ["write"],
        explicitUserRequest: true,
      }),
      { ok: true },
    );
    assert.deepEqual(
      validateDelegationPolicy({
        mode: "chain",
        taskCount: 3,
        permissions: ["read", "exec", "write"],
        explicitUserRequest: true,
      }),
      { ok: true },
    );
  });
});
