import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { resolvePreferredPiAgentDir, WINDOWS_S_DRIVE_AGENT_DIR } from "./agent-dir";

test("prefers PI_CODING_AGENT_DIR when it is set", () => {
  const resolved = resolvePreferredPiAgentDir({
    env: {
      PI_CODING_AGENT_DIR: "C:/custom/pi-agent",
      PI_GUI_AGENT_DIR: "S:/tool/pi/agent",
    },
    pathExists: () => true,
  });

  assert.equal(resolved, path.resolve("C:/custom/pi-agent"));
});

test("falls back to PI_GUI_AGENT_DIR when runtime env is unset", () => {
  const resolved = resolvePreferredPiAgentDir({
    env: {
      PI_GUI_AGENT_DIR: "C:/gui-agent",
    },
    pathExists: () => true,
  });

  assert.equal(resolved, path.resolve("C:/gui-agent"));
});

test("uses the Windows S drive pi agent directory when available", () => {
  const expected = path.resolve(WINDOWS_S_DRIVE_AGENT_DIR);
  const resolved = resolvePreferredPiAgentDir({
    env: {},
    pathExists: (candidate) => candidate === expected,
  });

  assert.equal(resolved, expected);
});

test("returns undefined when no preferred agent directory is available", () => {
  const resolved = resolvePreferredPiAgentDir({
    env: {},
    pathExists: () => false,
  });

  assert.equal(resolved, undefined);
});
