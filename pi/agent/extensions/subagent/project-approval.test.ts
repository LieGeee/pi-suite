import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideProjectAgentApproval } from "./project-approval.js";

describe("subagent project agent approval", () => {
  it("does not gate calls that do not request project agents", () => {
    assert.equal(
      decideProjectAgentApproval({
        projectAgentsRequested: false,
        hasUI: false,
        confirmProjectAgents: true,
        explicitUserRequest: false,
      }),
      undefined,
    );
  });

  it("denies headless runs without an explicit user request", () => {
    assert.deepEqual(
      decideProjectAgentApproval({
        projectAgentsRequested: true,
        hasUI: false,
        confirmProjectAgents: true,
        explicitUserRequest: false,
      }),
      { action: "deny", reason: "Project-local agents require an explicit user request when running without a UI." },
    );
  });

  it("allows headless runs with an explicit user request", () => {
    assert.deepEqual(
      decideProjectAgentApproval({
        projectAgentsRequested: true,
        hasUI: false,
        confirmProjectAgents: true,
        explicitUserRequest: true,
      }),
      { action: "allow" },
    );
  });

  it("confirms in UI mode when confirmation is enabled", () => {
    assert.deepEqual(
      decideProjectAgentApproval({
        projectAgentsRequested: true,
        hasUI: true,
        confirmProjectAgents: true,
        explicitUserRequest: false,
      }),
      { action: "confirm" },
    );
  });

  it("allows in UI mode when confirmation is disabled", () => {
    assert.deepEqual(
      decideProjectAgentApproval({
        projectAgentsRequested: true,
        hasUI: true,
        confirmProjectAgents: false,
        explicitUserRequest: false,
      }),
      { action: "allow" },
    );
  });
});
