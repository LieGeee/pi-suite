import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import {
  buildWindowsTaskkillArgs,
  killProcessTree,
  waitForChildProcess,
} from "./process-control.js";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("subagent process control", () => {
  it("builds a forced Windows process-tree termination command", () => {
    assert.deepEqual(buildWindowsTaskkillArgs(42), ["/F", "/T", "/PID", "42"]);
  });

  it("returns the child exit code", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(7)"], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.equal(await waitForChildProcess(child), 7);
  });

  it("maps signal termination to a non-zero exit", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    await delay(100);
    child.kill("SIGTERM");
    assert.notEqual(await waitForChildProcess(child), 0);
  });

  it("treats a destroyed stdout stream as end without rejecting", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(3)"], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Force the pipe closed early, as an OS EPIPE would, before exit resolves.
    child.stdout?.destroy();
    child.stderr?.destroy();
    assert.equal(await waitForChildProcess(child), 3);
  });

  it("treats a non-EPIPE stream error as stream end without rejecting", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(5)"], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const wait = waitForChildProcess(child);
    // Real stream errors are delivered asynchronously, after the wait promise
    // has attached its listeners. Emulate that ordering.
    setTimeout(() => {
      child.stdout?.emit("error", new Error("fake non-EPIPE stream error"));
    }, 20);
    assert.equal(await wait, 5);
  });

  it("kills descendants together with the child", { timeout: 10_000 }, async () => {
    const marker = join(tmpdir(), `pi-subagent-tree-${process.pid}-${Date.now()}.txt`);
    const descendantScript = [
      "const fs = require('node:fs');",
      `setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, 'alive'), 1500);`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const parentScript = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: 'ignore' });`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const parent = spawn(process.execPath, ["-e", parentScript], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await delay(250);
      assert.ok(parent.pid, "parent process must have a PID");
      killProcessTree(parent.pid);
      const exitCode = await waitForChildProcess(parent);
      assert.notEqual(exitCode, 0, "signal-terminated child must not look successful");
      await delay(1800);
      assert.equal(existsSync(marker), false, "descendant must not survive to write its marker");
    } finally {
      if (parent.pid) killProcessTree(parent.pid);
      rmSync(marker, { force: true });
    }
  });
});
