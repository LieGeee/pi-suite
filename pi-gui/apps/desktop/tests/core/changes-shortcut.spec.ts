import { expect, test } from "@playwright/test";
import { createNamedThread, desktopShortcut, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";

test("切换改动快捷键可以打开和关闭检查面板", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("changes-shortcut-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Shortcut thread", { workspaceName: "changes-shortcut-workspace" });

    const inspector = window.locator(".diff-panel");
    await expect(inspector).toHaveCount(0);

    await window.keyboard.press(desktopShortcut("D"));
    await expect(inspector).toBeVisible();

    await window.keyboard.press(desktopShortcut("D"));
    await expect(inspector).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
