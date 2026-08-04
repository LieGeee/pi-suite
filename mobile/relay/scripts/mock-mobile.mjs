#!/usr/bin/env node
import WebSocket from "ws";

const serverUrl = process.env.RELAY_URL ?? "ws://127.0.0.1:8787/ws/mobile";
const pairToken = process.env.PAIR_TOKEN;

if (!pairToken) {
  console.error("Set PAIR_TOKEN before running mock mobile.");
  process.exit(1);
}

const socket = new WebSocket(serverUrl);

socket.on("open", () => {
  console.log(`[mobile] connected ${serverUrl}`);
  socket.send(JSON.stringify({
    type: "mobile.hello",
    payload: {
      pairToken,
      deviceName: "Mock Phone",
    },
  }));
});

socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  console.log("[mobile] recv", JSON.stringify(message));
  if (message.type === "server.snapshot" || message.type === "desktop.snapshot") {
    socket.send(JSON.stringify({
      type: "mobile.command",
      commandId: `mock-${Date.now()}`,
      command: "command.sendMessage",
      payload: {
        workspaceId: "mock-workspace",
        sessionId: "mock-session",
        text: "手机端 mock 消息",
      },
    }));
  }
});

socket.on("close", () => console.log("[mobile] closed"));
socket.on("error", (error) => console.error("[mobile] error", error));
