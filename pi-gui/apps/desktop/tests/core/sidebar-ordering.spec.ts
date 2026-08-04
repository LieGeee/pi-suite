import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("sidebar local sessions hide the local badge and can be renamed from the row menu", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("session-rename-test");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Rename source", { workspaceName: basename(workspacePath) });

    const row = window.locator(".session-row").filter({ hasText: "Rename source" });
    await expect(row).toBeVisible();
    await expect(row.locator(".session-row__environment")).toHaveCount(0);
    await expect(row).not.toContainText("本地");

    await row.hover();
    await row.getByRole("button", { name: "会话操作：Rename source" }).click();
    await window.getByRole("menuitem", { name: "重命名会话" }).click();

    const renameInput = row.getByLabel("重命名会话 Rename source");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Renamed session");
    await row.getByRole("button", { name: "保存" }).click();

    await expect(window.locator(".chat-header__title")).toHaveText("Renamed session");
    await expect.poll(async () => {
      const state = await getDesktopState(window);
      const workspaceRecord = state.workspaces.find((w) => w.id === workspace.id);
      return workspaceRecord?.sessions.some((session) => session.title === "Renamed session") ?? false;
    }).toBe(true);
    await expect(window.locator(".session-row").filter({ hasText: "Renamed session" })).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("sidebar thread order is stable after creation and does not flicker", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("ordering-test");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);

    // Create thread A — it should be at the top (most recent updatedAt).
    await createNamedThread(window, "Thread A", { workspaceName: basename(workspacePath) });
    const afterA = await getDesktopState(window);
    const wsAfterA = afterA.workspaces.find((w) => w.id === workspace.id)!;
    expect(wsAfterA.sessions).toHaveLength(1);

    // Small delay so thread B gets a strictly later updatedAt.
    await new Promise((r) => setTimeout(r, 50));

    // Create thread B — it should now be at the top.
    await createNamedThread(window, "Thread B", { workspaceName: basename(workspacePath) });

    await expect.poll(async () => {
      const state = await getDesktopState(window);
      return state.workspaces.find((w) => w.id === workspace.id)?.sessions.length ?? 0;
    }).toBe(2);

    const afterB = await getDesktopState(window);
    const wsAfterB = afterB.workspaces.find((w) => w.id === workspace.id)!;
    const sessionB = wsAfterB.sessions.find((s) => s.title === "Thread B")!;
    const sessionA = wsAfterB.sessions.find((s) => s.title === "Thread A")!;

    // Thread B was created/interacted with more recently, so its updatedAt should be >= A's.
    expect(sessionB.updatedAt >= sessionA.updatedAt).toBe(true);

    // Verify sidebar renders B before A (most recent first).
    const rows = window.locator(".session-row__select");
    const titles = await rows.allTextContents();
    const bIndex = titles.findIndex((t) => t.includes("Thread B"));
    const aIndex = titles.findIndex((t) => t.includes("Thread A"));
    expect(bIndex).toBeGreaterThanOrEqual(0);
    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(bIndex).toBeLessThan(aIndex);

    // Record the updatedAt values and verify they remain stable over time.
    // This catches the bug where agent events would continuously update updatedAt.
    const snapshot1B = sessionB.updatedAt;
    const snapshot1A = sessionA.updatedAt;

    // Wait briefly and re-check — updatedAt should NOT have changed without user action.
    await new Promise((r) => setTimeout(r, 500));
    const laterState = await getDesktopState(window);
    const wsLater = laterState.workspaces.find((w) => w.id === workspace.id)!;
    const laterB = wsLater.sessions.find((s) => s.title === "Thread B")!;
    const laterA = wsLater.sessions.find((s) => s.title === "Thread A")!;
    expect(laterB.updatedAt).toBe(snapshot1B);
    expect(laterA.updatedAt).toBe(snapshot1A);

    // Verify sidebar order is unchanged.
    const laterTitles = await rows.allTextContents();
    const laterBIndex = laterTitles.findIndex((t) => t.includes("Thread B"));
    const laterAIndex = laterTitles.findIndex((t) => t.includes("Thread A"));
    expect(laterBIndex).toBeLessThan(laterAIndex);
  } finally {
    await harness.close();
  }
});
