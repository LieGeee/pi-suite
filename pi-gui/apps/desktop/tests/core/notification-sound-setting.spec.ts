import { expect, test } from "@playwright/test";
import { desktopShortcut, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";

test("notification settings expose the sound toggle", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("notification-sound-setting-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await window.keyboard.press(desktopShortcut(","));
    await window.getByRole("button", { name: "通知", exact: true }).click();
    await expect(window.getByLabel("提示音")).toBeVisible();
    await expect(window.getByLabel("提示音")).toBeChecked();
  } finally {
    await harness.close();
  }
});
