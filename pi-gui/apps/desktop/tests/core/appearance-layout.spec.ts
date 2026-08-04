import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
  type PiAppWindow,
} from "../helpers/electron-app";

test("三套主题共享中文 Codex 布局且最小桌面尺寸可交互", async () => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("appearance-layout");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
    envOverrides: { PI_APP_DEFAULT_SIDEBAR_TAB: "conversations" },
  });

  try {
    const window = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
    });
    await waitForWorkspaceByPath(window, workspacePath);
    await window.evaluate(async () => {
      const app = (window as PiAppWindow).piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setActiveView("new-thread");
    });

    await expect(window.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    await expect(window.locator(".new-thread__quick-actions button")).toHaveCount(4);
    await expect(window.locator(".new-thread__project-bar")).toBeVisible();
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect(window.getByTestId("conversation-sidebar")).toBeVisible();

    const geometry = await window.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error(`缺少 ${selector}`);
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      return {
        sidebar: rect(".sidebar"),
        main: rect(".main"),
        hero: rect(".new-thread__hero"),
        actions: rect(".new-thread__quick-actions"),
        project: rect(".new-thread__project-bar"),
        composer: rect(".new-thread__composer"),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    expect(geometry.sidebar.right).toBeLessThanOrEqual(geometry.main.left + 1);
    expect(geometry.hero.bottom).toBeLessThanOrEqual(geometry.actions.top + 1);
    expect(geometry.actions.bottom).toBeLessThanOrEqual(geometry.project.top + 1);
    expect(geometry.project.bottom).toBeLessThanOrEqual(geometry.composer.top + 1);
    expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.horizontalOverflow).toBe(false);

    await window.getByRole("button", { name: /审查代码/ }).click();
    await expect(window.getByTestId("new-thread-composer")).toHaveValue(/审查当前代码变更/);

    const sharedSelectors = [".sidebar", ".new-thread__hero", ".new-thread__quick-actions", ".new-thread__project-bar", ".new-thread__composer"];
    for (const theme of ["miku-dream", "pure-white", "pi-native"] as const) {
      await window.evaluate(async (themeId) => {
        const app = (window as PiAppWindow).piApp;
        if (!app) throw new Error("piApp 不可用");
        await app.setAppearanceTheme(themeId);
      }, theme);
      await expect.poll(() => window.evaluate(() => document.documentElement.dataset.appearanceTheme)).toBe(theme);
      for (const selector of sharedSelectors) {
        await expect(window.locator(selector)).toHaveCount(1);
      }
      // 验证 eyebrow 主题互斥：miku-dream 显示 Miku，其他显示默认
      const mikuDisplay = await window.evaluate(() => {
        const el = document.querySelector(".new-thread__eyebrow-miku");
        return el ? getComputedStyle(el).display : "missing";
      });
      const defaultDisplay = await window.evaluate(() => {
        const el = document.querySelector(".new-thread__eyebrow-default");
        return el ? getComputedStyle(el).display : "missing";
      });
      if (theme === "miku-dream") {
        expect(mikuDisplay).not.toBe("none");
        expect(defaultDisplay).toBe("none");
      } else {
        expect(mikuDisplay).toBe("none");
        expect(defaultDisplay).not.toBe("none");
      }
    }
  } finally {
    await harness.close();
  }
});
