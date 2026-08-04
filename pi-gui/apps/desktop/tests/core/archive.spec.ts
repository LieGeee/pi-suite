import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

test("archives a hovered thread into a restorable sidebar section", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("archive-sidebar-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Thread one");
    await createNamedThread(window, "Thread two");
    await expect(window.locator(".topbar__session")).toHaveText("Thread two");

    const activeRow = window.locator(".session-list > .session-row").filter({ hasText: "Thread two" }).first();
    const sessionMenuButton = activeRow.locator(".session-row__action");
    const timeLabel = activeRow.locator(".session-row__time");

    await expect(sessionMenuButton).toHaveCSS("opacity", "0");
    await expect(timeLabel).toHaveCSS("opacity", "1");

    await activeRow.hover();
    await activeRow.getByRole("button", { name: "会话操作：Thread two" }).click();
    await window.getByRole("menuitem", { name: "归档会话" }).click();
    await expect(window.locator(".topbar__session")).toHaveText("Thread one");
    const archivedGroup = window.locator(".archived-thread-group");
    const archivedToggle = archivedGroup.locator(".archived-thread-group__toggle");
    await expect(archivedGroup).toContainText("已归档");
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "false");
    await expect(window.locator(".session-list--archived")).toHaveCount(0);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return state.workspaces[0]?.sessions.find((session) => session.title === "Thread two")?.archivedAt ?? "";
      })
      .not.toBe("");

    await archivedToggle.click();
    await expect(archivedToggle).toHaveAttribute("aria-expanded", "true");
    await expect(window.locator(".session-list--archived")).toContainText("Thread two");

    const archivedRow = window.locator(".session-list--archived .session-row").filter({ hasText: "Thread two" }).first();
    await archivedRow.hover();
    await archivedRow.getByRole("button", { name: "会话操作：Thread two" }).click();
    await window.getByRole("menuitem", { name: "恢复会话" }).click();

    await expect(window.locator(".session-list > .session-row").filter({ hasText: "Thread two" })).toHaveCount(1);
    await expect(window.locator(".archived-thread-group")).toHaveCount(0);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return state.workspaces[0]?.sessions.find((session) => session.title === "Thread two")?.archivedAt ?? "";
      })
      .toBe("");
  } finally {
    await harness.close();
  }
});
