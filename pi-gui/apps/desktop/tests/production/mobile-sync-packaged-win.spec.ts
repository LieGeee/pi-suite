import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  launchDesktopByExecutable,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test.skip(process.platform !== "win32", "Windows packaged smoke uses win-unpacked/pi-gui.exe");

test("packaged Windows app exposes mobile sync settings", async () => {
  const releaseDir = process.env.PI_APP_TEST_RELEASE_DIR;
  test.skip(!releaseDir, "Set PI_APP_TEST_RELEASE_DIR to a release-* directory under apps/desktop.");

  const executablePath = resolve(__dirname, "..", "..", releaseDir, "win-unpacked", "pi-gui.exe");
  const userDataDir = await makeUserDataDir("pi-gui-mobile-sync-packaged-user-data-");
  const workspacePath = await makeWorkspace("mobile-sync-packaged-win");
  const harness = await launchDesktopByExecutable(executablePath, userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await window.keyboard.press(desktopShortcut(","));
    await window.getByRole("button", { name: "移动端同步", exact: true }).click();
    await expect(window.locator("h1", { hasText: "移动端同步" })).toBeVisible();
    await expect(window.getByLabel("移动端同步服务器地址")).toBeVisible();
  } finally {
    await harness.close();
  }
});
