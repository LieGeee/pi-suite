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

test("跨项目最近对话支持一级分组、可见归组按钮和独立拖拽手柄", async () => {
  const userDataDir = await makeUserDataDir();
  const alphaPath = await makeWorkspace("conversation-group-alpha");
  const betaPath = await makeWorkspace("conversation-group-beta");
  let harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [alphaPath, betaPath],
    testMode: "background",
    envOverrides: { PI_APP_DEFAULT_SIDEBAR_TAB: "conversations" },
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, alphaPath);
    await waitForWorkspaceByPath(window, betaPath);
    await createNamedThread(window, "甲项目分组任务", { workspaceName: basename(alphaPath) });
    await createNamedThread(window, "乙项目最近任务", { workspaceName: basename(betaPath) });

    const recent = window.getByTestId("recent-conversations");
    await expect(recent).toContainText("甲项目分组任务");
    await expect(recent).toContainText("乙项目最近任务");

    // ── Create group ──
    await window.getByRole("button", { name: "新建对话分组" }).click();
    await window.getByLabel("对话分组名称").fill("毕业设计");
    await window.getByRole("button", { name: "添加分组" }).click();

    const group = window.getByTestId("conversation-group");
    const alphaRow = recent.locator(".session-row").filter({ hasText: "甲项目分组任务" });
    const assignButton = alphaRow.getByRole("button", { name: "归入分组" });
    await expect(group).toContainText("毕业设计");
    await expect(assignButton).toBeVisible();
    await expect(alphaRow).not.toHaveAttribute("draggable", "true");
    const dragHandle = alphaRow.getByRole("button", { name: "拖动对话\u201c甲项目分组任务\u201d到分组" });
    await expect(dragHandle).toBeVisible();
    const dragHandleOpacity = await dragHandle.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(dragHandleOpacity).toBeGreaterThan(0);
    await expect(dragHandle).toHaveAttribute("draggable", "true");

    // ── Toggle aria-expanded ──
    const toggle = group.locator("button.conversation-group__toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // ── Rename 毕业设计 → 论文归档 via visible menu ──
    const editButton = group.getByRole("button", { name: /编辑分组/ });
    await expect(editButton).toHaveAttribute("aria-expanded", "false");
    await editButton.click();
    await expect(editButton).toHaveAttribute("aria-expanded", "true");
    const nameInput = group.getByLabel(/重命名分组/);
    await nameInput.clear();
    await nameInput.fill("论文归档");
    await group.getByRole("button", { name: "保存" }).click();
    await expect(editButton).toHaveAttribute("aria-expanded", "false");
    await expect.poll(async () => (await getDesktopState(window)).conversationGroups[0]?.name).toBe("论文归档");

    // ── Assign to renamed group ──
    await assignButton.click();
    await window.getByRole("menuitem", { name: "论文归档" }).click();
    await expect(group).toContainText("甲项目分组任务");
    await expect(recent).toContainText("甲项目分组任务");
    await expect.poll(async () => (await getDesktopState(window)).conversationGroups[0]?.sessions.length ?? 0).toBe(1);

    // ── Remove from renamed group ──
    await assignButton.click();
    await window.getByRole("menuitem", { name: "移出分组" }).click();
    await expect(group).not.toContainText("甲项目分组任务");
    await expect.poll(async () => (await getDesktopState(window)).conversationGroups[0]?.sessions.length ?? -1).toBe(0);

    const listStyle = await recent.evaluate((element) => {
      const style = getComputedStyle(element);
      return { contain: style.contain, backdropFilter: style.backdropFilter };
    });
    expect(listStyle.contain).toContain("paint");
    expect(listStyle.backdropFilter).toBe("none");
  } finally {
    await harness.close();
  }

  // ── Restart: verify renamed group persists ──
  harness = await launchDesktop(userDataDir, {
    testMode: "background",
    envOverrides: { PI_APP_DEFAULT_SIDEBAR_TAB: "conversations" },
  });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, alphaPath);

    const persistedGroup = window.getByTestId("conversation-group");
    await expect(persistedGroup).toContainText("论文归档");

    // ── Delete group via visible menu ──
    const editBtn = persistedGroup.getByRole("button", { name: /编辑分组/ });
    await expect(editBtn).toHaveAttribute("aria-expanded", "false");
    await editBtn.click();
    await expect(editBtn).toHaveAttribute("aria-expanded", "true");
    await persistedGroup.getByRole("button", { name: "删除" }).click();

    await expect.poll(async () => (await getDesktopState(window)).conversationGroups.length).toBe(0);
    await expect(window.getByTestId("conversation-group")).toHaveCount(0);
    await expect(window.getByTestId("recent-conversations")).toContainText(
      "新建一个分组，可整理来自不同项目的对话。",
    );
  } finally {
    await harness.close();
  }
});
