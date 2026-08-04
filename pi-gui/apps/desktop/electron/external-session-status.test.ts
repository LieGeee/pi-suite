import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceRecord } from "../src/desktop-state";
import {
  activeSessionSignature,
  applyExternalRunningStatuses,
  resolveActiveSessionMarkers,
  type ActiveSessionMarker,
} from "./external-session-status.ts";

const NOW = Date.parse("2026-08-02T16:00:20.000Z");

function marker(overrides: Partial<ActiveSessionMarker> = {}): ActiveSessionMarker {
  return {
    version: 1,
    sessionId: "running-session",
    sessionFile: "S:/tool/pi/agent/sessions/project/running-session.jsonl",
    cwd: "S:/code/project",
    pid: 4242,
    startedAt: "2026-08-02T16:00:00.000Z",
    heartbeatAt: "2026-08-02T16:00:15.000Z",
    ...overrides,
  };
}

test("resolveActiveSessionMarkers keeps only fresh markers with live processes", () => {
  const result = resolveActiveSessionMarkers(
    [
      marker(),
      marker({ sessionId: "stale", pid: 4343, heartbeatAt: "2026-08-02T15:59:40.000Z" }),
      marker({ sessionId: "dead", pid: 4444 }),
    ],
    { nowMs: NOW, maxAgeMs: 15_000, isProcessAlive: (pid) => pid !== 4444 },
  );

  assert.deepEqual([...result.keys()], ["running-session"]);
});

test("activeSessionSignature changes for run lifecycle, not heartbeat refreshes", () => {
  const original = new Map([["running-session", marker()]]);
  const heartbeatRefresh = new Map([["running-session", marker({ heartbeatAt: "2026-08-02T16:00:19.000Z" })]]);
  const nextRun = new Map([["running-session", marker({ startedAt: "2026-08-02T16:01:00.000Z" })]]);

  assert.equal(activeSessionSignature(original), activeSessionSignature(heartbeatRefresh));
  assert.notEqual(activeSessionSignature(original), activeSessionSignature(nextRun));
});

test("applyExternalRunningStatuses marks matching sessions running without mutating source", () => {
  const workspaces: readonly WorkspaceRecord[] = [{
    id: "S:/code/project",
    name: "project",
    path: "S:/code/project",
    lastOpenedAt: "2026-08-02T15:00:00.000Z",
    kind: "primary",
    sessions: [
      { id: "running-session", title: "Loop goal", preview: "", updatedAt: "2026-08-02T15:00:00.000Z", status: "idle", hasUnseenUpdate: false },
      { id: "idle-session", title: "Idle", preview: "", updatedAt: "2026-08-02T14:00:00.000Z", status: "idle", hasUnseenUpdate: false },
    ],
  }];
  const active = new Map([["running-session", marker()]]);

  const result = applyExternalRunningStatuses(workspaces, active);

  assert.equal(workspaces[0]?.sessions[0]?.status, "idle");
  assert.equal(result[0]?.sessions[0]?.status, "running");
  assert.equal(result[0]?.sessions[0]?.runningSince, "2026-08-02T16:00:00.000Z");
  assert.equal(result[0]?.sessions[1]?.status, "idle");
});
