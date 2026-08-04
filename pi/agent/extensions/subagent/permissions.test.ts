import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEffectiveTools,
  parseSubagentCommandArgs,
  permissionToTools,
} from "./permissions.js";

describe("subagent permission helpers", () => {
  it("defaults child agents to read-only tools", () => {
    assert.deepEqual(permissionToTools(undefined), ["read", "grep", "find", "ls"]);
    assert.deepEqual(permissionToTools("read"), ["read", "grep", "find", "ls"]);
  });

  it("maps exec and write permission levels to larger tool sets", () => {
    assert.deepEqual(permissionToTools("exec"), ["read", "grep", "find", "ls", "bash"]);
    assert.deepEqual(permissionToTools("write"), ["read", "grep", "find", "ls", "bash", "edit", "write"]);
  });

  it("caps agent-declared tools by the selected permission level", () => {
    assert.deepEqual(getEffectiveTools(["read", "grep", "bash"], "read"), ["read", "grep"]);
    assert.deepEqual(getEffectiveTools(["read", "grep", "bash"], "exec"), ["read", "grep", "bash"]);
    assert.deepEqual(getEffectiveTools(undefined, "write"), ["read", "grep", "find", "ls", "bash", "edit", "write"]);
  });

  it("parses /subagent command arguments with default read permission", () => {
    assert.deepEqual(parseSubagentCommandArgs("scout find auth code"), {
      agent: "scout",
      task: "find auth code",
      permission: "read",
      cwd: undefined,
      agentScope: "user",
    });
  });

  it("parses permission aliases, cwd, and project scope", () => {
    assert.deepEqual(parseSubagentCommandArgs("--exec --scope both --cwd S:/code/app worker run tests"), {
      agent: "worker",
      task: "run tests",
      permission: "exec",
      cwd: "S:/code/app",
      agentScope: "both",
    });

    assert.deepEqual(parseSubagentCommandArgs("--permission write worker implement feature"), {
      agent: "worker",
      task: "implement feature",
      permission: "write",
      cwd: undefined,
      agentScope: "user",
    });
  });

  it("keeps Windows backslash paths in --cwd intact", () => {
    assert.deepEqual(parseSubagentCommandArgs("--cwd C:\\Users\\leizh\\repo scout find auth"), {
      agent: "scout",
      task: "find auth",
      permission: "read",
      cwd: "C:\\Users\\leizh\\repo",
      agentScope: "user",
    });
  });

  it("returns usage errors for invalid commands", () => {
    assert.match(parseSubagentCommandArgs("").error ?? "", /Usage/);
    assert.match(parseSubagentCommandArgs("--permission root scout task").error ?? "", /Invalid permission/);
    assert.match(parseSubagentCommandArgs("scout").error ?? "", /Usage/);
  });
});
