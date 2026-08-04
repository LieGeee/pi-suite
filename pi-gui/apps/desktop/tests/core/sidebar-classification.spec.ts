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

test("侧栏历史支持当前工作区 3 级手动分类、多选合并和重命名", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("session-category-tree");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "登录接口整理", { workspaceName: basename(workspacePath) });
    await createNamedThread(window, "侧栏交互优化", { workspaceName: basename(workspacePath) });
    await createNamedThread(window, "组件 Dock 草稿", { workspaceName: basename(workspacePath) });

    const loginRow = window.locator(".session-row").filter({ hasText: "登录接口整理" }).first();
    const sidebarRow = window.locator(".session-row").filter({ hasText: "侧栏交互优化" }).first();

    await loginRow.click({ button: "right" });
    await window.getByRole("menuitem", { name: "多选此会话" }).click();
    await expect(window.getByText("已选择 1 个会话")).toBeVisible();
    await sidebarRow.getByRole("checkbox", { name: "选择会话 侧栏交互优化" }).check();
    await expect(window.getByText("已选择 2 个会话")).toBeVisible();

    await window.getByRole("button", { name: "合并为分类" }).click();
    await window.getByLabel("分类名称").fill("前端任务");
    await window.getByRole("button", { name: "创建分类" }).click();

    const rootCategory = window.getByRole("treeitem", { name: /前端任务/ });
    await expect(rootCategory).toBeVisible();
    await expect(window.locator("[data-testid='session-category-node']").filter({ hasText: "前端任务" })).toContainText("2");

    await rootCategory.click({ button: "right" });
    await window.getByRole("menuitem", { name: "新建子类" }).click();
    await window.getByLabel("子分类名称 前端任务").fill("界面");
    await window.getByRole("button", { name: "创建" }).click();

    const secondLevel = window.getByRole("treeitem", { name: /界面/ });
    await expect(secondLevel).toBeVisible();
    await secondLevel.click({ button: "right" });
    await window.getByRole("menuitem", { name: "新建子类" }).click();
    await window.getByLabel("子分类名称 界面").fill("历史侧栏");
    await window.getByRole("button", { name: "创建" }).click();

    const thirdLevel = window.getByRole("treeitem", { name: /历史侧栏/ });
    await expect(thirdLevel).toBeVisible();
    await thirdLevel.click({ button: "right" });
    await expect(window.getByRole("menuitem", { name: "新建子类" })).toHaveCount(0);

    await window.getByRole("menuitem", { name: "重命名分类" }).click();
    await window.getByLabel("重命名分类 历史侧栏").fill("历史侧栏归档");
    await window.getByRole("button", { name: "保存" }).click();
    await expect(window.getByRole("treeitem", { name: /历史侧栏归档/ })).toBeVisible();

    const dockRow = window.locator(".session-row").filter({ hasText: "组件 Dock 草稿" }).first();
    await dockRow.click({ button: "right" });
    await window.getByRole("menuitem", { name: "移动到分组：前端任务", exact: true }).click();
    await expect(window.locator("[data-testid='session-category-node']").filter({ hasText: "前端任务" })).toContainText("3");

    const movedDockRow = window.locator(".session-category-node").filter({ hasText: "前端任务" }).locator(".session-row").filter({ hasText: "组件 Dock 草稿" }).first();
    await expect(movedDockRow).toBeVisible();
    await movedDockRow.click({ button: "right" });
    await window.getByRole("menuitem", { name: "移出分组" }).click();
    await expect(window.locator("[data-testid='session-category-node']").filter({ hasText: "前端任务" })).toContainText("2");
    await expect(window.locator(".session-list > .session-row").filter({ hasText: "组件 Dock 草稿" })).toBeVisible();

    await expect.poll(async () => {
      const state = await getDesktopState(window);
      return state.sessionCategoriesByWorkspace[workspace.id]?.categories[0];
    }).toMatchObject({
      name: "前端任务",
      sessionRefs: expect.arrayContaining([
        expect.objectContaining({ workspaceId: workspace.id }),
        expect.objectContaining({ workspaceId: workspace.id }),
      ]),
      children: [
        expect.objectContaining({
          name: "界面",
          children: [expect.objectContaining({ name: "历史侧栏归档" })],
        }),
      ],
    });
  } finally {
    await harness.close();
  }
});
