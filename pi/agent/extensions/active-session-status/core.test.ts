import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { removeActiveSessionMarker, writeActiveSessionMarker } from "./core.ts";

test("active session marker is written atomically and removed on completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-active-session-"));
  try {
    const markerPath = await writeActiveSessionMarker(directory, {
      version: 1,
      sessionId: "session-123",
      sessionFile: "S:/tool/pi/agent/sessions/project/session-123.jsonl",
      cwd: "S:/code/project",
      pid: 4242,
      startedAt: "2026-08-02T16:00:00.000Z",
      heartbeatAt: "2026-08-02T16:00:05.000Z",
    });

    assert.equal(markerPath, join(directory, "session-123.4242.json"));
    const persisted = JSON.parse(await readFile(markerPath, "utf8"));
    assert.equal(persisted.sessionId, "session-123");
    assert.equal(persisted.pid, 4242);

    await removeActiveSessionMarker(markerPath);
    await assert.rejects(readFile(markerPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
