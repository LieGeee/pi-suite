import { describe, expect, it } from "vitest";
import {
  createInitialMobileState,
  mobileReducer,
  selectCurrentTask,
  selectTasks,
} from "../src/mobile-state";

describe("mobile state reducer", () => {
  it("stores desktop snapshots and flattens tasks", () => {
    const state = mobileReducer(createInitialMobileState(), {
      type: "desktop.snapshot",
      payload: {
        selectedWorkspaceId: "w1",
        selectedSessionId: "s2",
        permissions: { sendMessages: true },
        workspaces: [
          {
            id: "w1",
            name: "主工作区",
            path: "S:/repo",
            sessions: [
              { id: "s1", title: "旧任务", preview: "done", status: "idle", updatedAt: "2026-07-01T00:00:00Z" },
              { id: "s2", title: "当前任务", preview: "running", status: "running", updatedAt: "2026-07-02T00:00:00Z", hasUnseenUpdate: true },
            ],
          },
        ],
      },
    });

    expect(state.permissions.sendMessages).toBe(true);
    expect(selectTasks(state).map((task) => task.title)).toEqual(["当前任务", "旧任务"]);
    expect(selectCurrentTask(state)?.sessionId).toBe("s2");
  });

  it("stores transcripts, notifications, and command failures", () => {
    let state = createInitialMobileState();
    state = mobileReducer(state, {
      type: "desktop.transcript",
      payload: {
        workspaceId: "w1",
        sessionId: "s1",
        transcript: [
          { kind: "message", id: "m1", role: "user", text: "你好" },
          { kind: "message", id: "m2", role: "assistant", text: "收到" },
        ],
      },
    });
    state = mobileReducer(state, { type: "desktop.notification", payload: { title: "完成", body: "任务已完成" } });
    state = mobileReducer(state, { type: "command.failed", payload: { commandId: "cmd-1", error: "桌面端不在线" } });

    expect(state.transcripts["w1:s1"]?.[1]?.text).toBe("收到");
    expect(state.notifications[0]?.title).toBe("完成");
    expect(state.commandErrors[0]?.error).toBe("桌面端不在线");
  });

  it("marks auth failures and connection status", () => {
    let state = createInitialMobileState();
    state = mobileReducer(state, { type: "socket.status", payload: { status: "connected" } });
    state = mobileReducer(state, { type: "server.authFailed", payload: { message: "bad token" } });

    expect(state.connectionStatus).toBe("auth-failed");
    expect(state.lastError).toBe("bad token");
  });
});
