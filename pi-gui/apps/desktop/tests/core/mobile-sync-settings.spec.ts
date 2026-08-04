import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("移动端同步设置可配置服务器、权限并持久化", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("mobile-sync-settings");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "移动端同步", exact: true }).click();

    await expect(window.locator("h1", { hasText: "移动端同步" })).toBeVisible();
    await expect(window.getByText("未配置服务器地址", { exact: true })).toBeVisible();

    await window.getByLabel("移动端同步服务器地址").fill("wss://sync.example.test/pi-gui");
    await window.getByLabel("配对 Token").fill("pair-token-123");
    await window.getByLabel("发送消息/继续对话").check();
    await window.getByLabel("停止运行中的任务").check();
    await window.getByLabel("新建任务").check();
    await window.getByRole("button", { name: "保存移动端同步设置" }).click();

    await expect.poll(async () => {
      const state = await getDesktopState(window);
      return state.mobileSync.serverUrl;
    }).toBe("wss://sync.example.test/pi-gui");

    await expect.poll(async () => {
      const raw = JSON.parse(await readFile(join(userDataDir, "ui-state.json"), "utf8")) as {
        mobileSync?: {
          serverUrl?: string;
          pairToken?: string;
          permissions?: { sendMessages?: boolean; stopRuns?: boolean; createSessions?: boolean };
        };
      };
      return raw.mobileSync;
    }).toMatchObject({
      serverUrl: "wss://sync.example.test/pi-gui",
      pairToken: "pair-token-123",
      permissions: {
        sendMessages: true,
        stopRuns: true,
        createSessions: true,
      },
    });
  } finally {
    await harness.close();
  }
});
