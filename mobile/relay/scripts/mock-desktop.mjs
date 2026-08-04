#!/usr/bin/env node
import WebSocket from "ws";

const serverUrl = process.env.RELAY_URL ?? "ws://127.0.0.1:8787/ws/desktop";
const pairToken = process.env.PAIR_TOKEN;

if (!pairToken) {
  console.error("Set PAIR_TOKEN before running mock desktop.");
  process.exit(1);
}

const socket = new WebSocket(serverUrl);

socket.on("open", () => {
  console.log(`[desktop] connected ${serverUrl}`);
  socket.send(JSON.stringify({
    type: "desktop.hello",
    payload: {
      version: 1,
      pairToken,
      permissions: {
        taskList: true,
        conversationDetails: true,
        notifications: true,
        sendMessages: true,
        stopRuns: true,
        createSessions: true,
      },
    },
  }));
  socket.send(JSON.stringify({
    type: "desktop.snapshot",
    payload: {
      selectedWorkspaceId: "mock-workspace",
      selectedSessionId: "mock-session",
      workspaces: [{
        id: "mock-workspace",
        name: "Mock Workspace",
        path: "S:/mock/workspace",
        sessions: [{
          id: "mock-session",
          title: "Mock mobile sync task",
          status: "idle",
          preview: "This is a mock desktop snapshot",
          updatedAt: new Date().toISOString(),
        }],
      }],
    },
  }));
});

socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  console.log("[desktop] recv", JSON.stringify(message));
  if (message.type === "mobile.command") {
    socket.send(JSON.stringify({
      type: "command.completed",
      payload: { commandId: message.commandId },
    }));
  }
});

socket.on("close", () => console.log("[desktop] closed"));
socket.on("error", (error) => console.error("[desktop] error", error));
