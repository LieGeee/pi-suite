import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("component dock renders only user-configured pinned components and supports right-click details", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("component-dock-workspace");
  const agentDir = join(userDataDir, "agent");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Component dock session");

    const dock = window.getByTestId("component-dock");
    await expect(dock).toBeVisible();
    await expect(dock).not.toContainText("开发模式");
    await expect(dock).not.toContainText("微信链接");

    await window.getByRole("button", { name: "扩展", exact: true }).click();
    await window.getByTestId("management-sidebar").getByRole("button", { name: /组件管理/ }).click();
    await expect(window.getByRole("heading", { name: "组件管理", exact: true })).toBeVisible();
    await expect(window.getByRole("heading", { name: "AI 生成/编辑组件", exact: true })).toBeVisible();
    await expect(window.getByLabel("组件需求描述")).toBeVisible();
    await expect(window.getByRole("button", { name: "生成组件草稿" })).toBeVisible();

    await window.getByLabel("组件名称").fill("开发模式");
    await window.getByLabel("组件类型").selectOption("development-mode");
    await window.getByLabel("组件图标").fill("🤖");
    await window.getByRole("button", { name: "添加组件" }).click();
    await expect(dock).toContainText("开发模式");
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const component = state.componentDock.componentDefinitions.find((entry) => entry.label === "开发模式");
        if (!component) return undefined;
        const raw = await readFile(join(agentDir, "components", component.id, "component.json"), "utf8");
        return JSON.parse(raw).label as string;
      })
      .toBe("开发模式");

    await dock.getByRole("button", { name: /开发模式/ }).click();
    await expect.poll(async () => (await getDesktopState(window)).componentDock.activeComponentId).not.toBeUndefined();

    await dock.getByRole("button", { name: /开发模式/ }).click({ button: "right" });
    const popover = window.getByTestId("component-dock-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("主 Agent");
    await popover.getByRole("button", { name: "详细配置" }).click();

    await expect(window.getByTestId("extensions-surface")).toBeVisible();
    await expect(window.getByText("开发模式配置", { exact: true })).toBeVisible();
    await window.getByRole("button", { name: "添加子 Agent" }).click();
    await window.getByLabel("子 Agent 名称").fill("代码审查");
    await window.getByRole("button", { name: "保存开发模式" }).click();
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const dev = state.componentDock.componentDefinitions.find((component) => component.kind === "development-mode");
        return dev?.developmentMode?.subagents[0]?.name;
      })
      .toBe("代码审查");

    await window.getByTestId("management-sidebar").getByRole("button", { name: /组件管理/ }).click();
    await window.getByLabel("组件名称").fill("微信链接");
    await window.getByLabel("组件类型").selectOption("external-link");
    await window.getByLabel("组件图标").fill("💬");
    await window.getByRole("button", { name: "添加组件" }).click();
    await expect(dock).toContainText("微信链接");
  } finally {
    await harness.close();
  }
});
