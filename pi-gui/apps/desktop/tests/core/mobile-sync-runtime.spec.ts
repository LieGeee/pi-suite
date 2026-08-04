import { once } from "node:events";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

const require = createRequire(__filename);
const { WebSocketServer } = require("ws") as {
  WebSocketServer: new (options: { port: number; host: string }) => {
    address(): { port: number } | string | null;
    close(callback?: () => void): void;
    on(event: "connection", listener: (socket: { send(data: string): void; on(event: "message", listener: (data: unknown) => void): void }) => void): void;
  };
};

test("移动端同步保存服务器后会连接并推送桌面快照", async () => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate mock WebSocket port");
  }
  const messages: unknown[] = [];
  let connectionCount = 0;
  let serverSocket: { send(data: string): void } | undefined;
  server.on("connection", (socket) => {
    connectionCount += 1;
    serverSocket = socket;
    socket.on("message", (data) => {
      messages.push(JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)));
    });
  });

  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("mobile-sync-runtime");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await window.keyboard.press(desktopShortcut(","));
    await window.getByRole("button", { name: "移动端同步", exact: true }).click();
    await window.getByLabel("移动端同步服务器地址").fill(`ws://127.0.0.1:${address.port}`);
    await window.getByLabel("配对 Token").fill("pair-token-runtime");
    await window.getByLabel("发送消息/继续对话").uncheck();
    await window.getByRole("button", { name: "保存移动端同步设置" }).click();

    await expect.poll(() => messages.map((message) => (message as { type?: string }).type)).toContain("desktop.hello");
    await expect.poll(() => messages.map((message) => (message as { type?: string }).type)).toContain("desktop.snapshot");

    const hello = messages.find((message) => (message as { type?: string }).type === "desktop.hello") as {
      payload?: { pairToken?: string };
    };
    expect(hello.payload?.pairToken).toBe("pair-token-runtime");

    const snapshot = messages.find((message) => (message as { type?: string }).type === "desktop.snapshot") as {
      payload?: { workspaces?: readonly { name?: string; path?: string }[]; pairToken?: string };
    };
    expect(snapshot.payload?.pairToken).toBeUndefined();
    expect(snapshot.payload?.workspaces?.some((workspace) => workspace.path === workspacePath)).toBe(true);

    await expect.poll(() => Boolean(serverSocket)).toBe(true);
    serverSocket?.send(JSON.stringify({
      type: "mobile.command",
      commandId: "cmd-send-message-denied",
      command: "command.sendMessage",
      payload: {
        workspaceId: "missing-workspace",
        sessionId: "missing-session",
        text: "手机端未授权消息",
      },
    }));
    await expect.poll(() => {
      const failed = messages.find((message) => (message as { type?: string }).type === "command.failed") as
        | { payload?: { commandId?: string; error?: string } }
        | undefined;
      return failed?.payload;
    }).toMatchObject({
      commandId: "cmd-send-message-denied",
      error: expect.stringContaining("没有发送消息权限"),
    });

    serverSocket?.send(JSON.stringify({
      type: "server.authFailed",
      payload: {
        message: "bad pair token",
      },
    }));
    await expect.poll(async () => {
      const state = await getDesktopState(window);
      return state.mobileSync.connectionStatus;
    }).toBe("auth-failed");

    await window.getByRole("button", { name: "保存移动端同步设置" }).click();
    await expect.poll(() => connectionCount).toBeGreaterThan(1);
  } finally {
    await harness.close();
    await new Promise<void>((resolve) => server.close(resolve));
  }
});
