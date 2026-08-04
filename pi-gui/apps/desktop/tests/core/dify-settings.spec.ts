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

test("saves the Dify endpoint and app key from settings", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("dify-settings");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "Dify", exact: true }).click();

    await window.getByLabel("Dify 服务器地址").fill("https://dify.example.test/v1");
    await window.getByLabel("Dify API 密钥").fill("app-test-key");
    await window.getByRole("button", { name: "保存", exact: true }).click();

    await expect.poll(async () => (await getDesktopState(window)).difyConfig).toEqual({
      serverUrl: "https://dify.example.test/v1",
      apiKey: "app-test-key",
    });
    await expect.poll(async () => {
      const persisted = JSON.parse(await readFile(join(userDataDir, "ui-state.json"), "utf8")) as {
        readonly difyConfig?: unknown;
      };
      return persisted.difyConfig;
    }).toEqual({
      serverUrl: "https://dify.example.test/v1",
      apiKey: "app-test-key",
    });
  } finally {
    await harness.close();
  }
});
