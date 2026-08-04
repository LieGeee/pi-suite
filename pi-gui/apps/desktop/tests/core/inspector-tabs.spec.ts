import { expect, test } from "@playwright/test";
import { createNamedThread, desktopShortcut, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";

test("right inspector exposes Changes, Review, and Files tabs", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("inspector-tabs-workspace");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Inspector tabs", { workspaceName: "inspector-tabs-workspace" });
    await window.getByLabel("切换改动面板").click();

    const inspector = window.locator(".diff-panel");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("tab", { name: "改动" })).toBeVisible();
    await expect(inspector.getByRole("tab", { name: "审查" })).toBeVisible();
    await expect(inspector.getByRole("tab", { name: "文件" })).toBeVisible();
  } finally {
    await harness.close();
  }
});
