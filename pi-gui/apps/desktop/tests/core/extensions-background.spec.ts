import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("sidebar management modes switch between Skills, Extensions, and Settings with background gradient controls in Extensions", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-background-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await window.getByRole("button", { name: "扩展", exact: true }).click();
    const managementSidebar = window.getByTestId("management-sidebar");
    await expect(managementSidebar).toBeVisible();
    await expect(managementSidebar).toContainText("背景渐变");
    await expect(window.getByTestId("extensions-surface")).toBeVisible();

    await window.getByRole("button", { name: "技能", exact: true }).click();
    await expect(managementSidebar).toContainText("搜索技能");
    await expect(window.getByTestId("skills-surface")).toBeVisible();

    await window.getByRole("button", { name: "扩展", exact: true }).click();
    await expect(managementSidebar).toContainText("搜索扩展");
    await expect(window.getByTestId("extensions-surface")).toBeVisible();

    await window.getByRole("button", { name: "设置", exact: true }).click();
    await expect(managementSidebar).toContainText("外观");
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "扩展", exact: true }).click();
    await managementSidebar.getByRole("button", { name: /背景渐变/ }).click();
    await expect(window.getByTestId("extensions-surface")).toBeVisible();

    const gradientSlider = window.getByRole("slider", { name: "背景渐变强度" });
    await expect(gradientSlider).toBeVisible();
    await gradientSlider.fill("46");

    await expect.poll(async () => (await getDesktopState(window)).backgroundGradientIntensity).toBe(46);
    await expect
      .poll(async () =>
        window.evaluate(() => document.documentElement.style.getPropertyValue("--shell-gradient-primary-alpha")),
      )
      .toBe("0.46");

    const persisted = JSON.parse(await readFile(join(userDataDir, "ui-state.json"), "utf8")) as {
      readonly backgroundGradientIntensity?: unknown;
    };
    expect(persisted.backgroundGradientIntensity).toBe(46);
  } finally {
    await harness.close();
  }
});
