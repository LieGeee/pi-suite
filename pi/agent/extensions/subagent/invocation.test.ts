import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { buildSubagentBaseArgs, resolveSubagentPiInvocation } from "./invocation.js";

describe("subagent pi invocation args", () => {
  it("passes configured provider before model to avoid ambiguous model resolution", () => {
    assert.deepEqual(
      buildSubagentBaseArgs({ provider: "100", model: "gpt-5.5", thinking: "medium" }, ["read", "grep"]),
      [
        "--mode", "json", "-p", "--no-session",
        "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes",
        "--provider", "100",
        "--model", "gpt-5.5",
        "--thinking", "medium",
        "--tools", "read,grep",
      ],
    );
  });

  it("keeps existing model-only behavior when no provider is configured", () => {
    assert.deepEqual(
      buildSubagentBaseArgs({ model: "gpt-5.5" }, ["read"]),
      [
        "--mode", "json", "-p", "--no-session",
        "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes",
        "--model", "gpt-5.5", "--tools", "read",
      ],
    );
  });

  it("keeps project context files enabled in lean child mode", () => {
    const args = buildSubagentBaseArgs({ model: "gpt-5.5" }, ["read"]);
    assert.equal(args.includes("--no-context-files"), false);
  });

  it("uses the sibling terminal pi CLI from a generic Node host when available", () => {
    const agentDir = resolve("S:/tool/pi/agent");
    const cliPath = resolve("S:/tool/pi/runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js");

    assert.deepEqual(
      resolveSubagentPiInvocation(["--mode", "json"], {
        agentDir,
        currentScript: "/$bunfs/root/cli.js",
        executablePath: "C:/Program Files/nodejs/node.exe",
        isElectron: false,
        pathExists: (candidate) => candidate === cliPath,
      }),
      {
        command: "C:/Program Files/nodejs/node.exe",
        args: [cliPath, "--mode", "json"],
      },
    );
  });

  it("uses the sibling terminal pi CLI instead of an Electron host executable", () => {
    const agentDir = resolve("S:/tool/pi/agent");
    const cliPath = resolve("S:/tool/pi/runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js");

    assert.deepEqual(
      resolveSubagentPiInvocation(["--mode", "json"], {
        agentDir,
        currentScript: "S:/tool/pi-gui/resources/app.asar/main.js",
        executablePath: "S:/tool/pi-gui/pi-gui.exe",
        isElectron: true,
        pathExists: (candidate) => candidate === cliPath,
      }),
      {
        command: "node",
        args: [cliPath, "--mode", "json"],
      },
    );
  });

  it("never re-invokes an arbitrary Node host script as the Pi CLI", () => {
    const agentDir = resolve("S:/tool/pi/agent");
    const cliPath = resolve("S:/tool/pi/runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js");

    assert.deepEqual(
      resolveSubagentPiInvocation(["--mode", "json"], {
        agentDir,
        currentScript: "S:/tool/pi/tmp/some-host-script.mjs",
        executablePath: "C:/Program Files/nodejs/node.exe",
        isElectron: false,
        pathExists: (candidate) => candidate === cliPath,
      }),
      {
        command: "C:/Program Files/nodejs/node.exe",
        args: [cliPath, "--mode", "json"],
      },
    );
  });

  it("still reuses the real pi CLI script when running under it", () => {
    const cliPath = "S:/tool/pi/runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js";
    const execPath = "C:/Program Files/nodejs/node.exe";

    assert.deepEqual(
      resolveSubagentPiInvocation(["--mode", "json"], {
        currentScript: cliPath,
        executablePath: execPath,
        isElectron: false,
        pathExists: (candidate) => candidate === cliPath,
      }),
      {
        command: execPath,
        args: [cliPath, "--mode", "json"],
      },
    );
  });
});
