import { expect, test } from "@playwright/test";
import { join } from "node:path";
import {
  createNamedThread,
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openConversationView,
  seedAgentDir,
  selectSession,
} from "../helpers/electron-app";

function parseRgb(color: string): [number, number, number] {
  const channels = color.match(/\d+(?:\.\d+)?/g);
  if (!channels || channels.length < 3) {
    throw new Error(`Unsupported color value: ${color}`);
  }
  return [Number(channels[0]), Number(channels[1]), Number(channels[2])];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linearized = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linearized[0] + 0.7152 * linearized[1] + 0.0722 * linearized[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("supports keyboard shortcuts, slash menus, and topbar controls through the user surface", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("controls-workspace");
  await seedAgentDir(agentDir);
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Controls session");
    await expect(window.locator(".topbar__session")).toHaveText("Controls session");

    const composer = window.getByTestId("composer");

    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await expect(window.locator(".view-header__title")).toContainText("通用");

    await window.keyboard.press(desktopShortcut("Shift+O"));
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect(window.getByTestId("new-thread-composer")).toBeFocused();

    await selectSession(window, "Controls session");
    await expect(composer).toBeFocused();

    await composer.fill("/stat");
    const slashMenu = window.getByTestId("slash-menu");
    await expect(slashMenu).toBeVisible();
    await expect(slashMenu).toContainText("状态");
    const slashMenuBox = await slashMenu.boundingBox();
    const composerBox = await composer.boundingBox();
    expect(slashMenuBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect((slashMenuBox?.y ?? 0) + (slashMenuBox?.height ?? 0)).toBeLessThanOrEqual((composerBox?.y ?? 0) + 2);

    await composer.press("Tab");
    await expect(slashMenu).toHaveCount(0);
    await expect(composer).toHaveValue("/status");
    await composer.press("Enter");
    await expect(window.getByTestId("transcript")).toContainText(/模型|当前没有会话级覆盖设置/);
    await expect(composer).toHaveValue("");

    await composer.fill("Need a quick check /stat");
    await expect(slashMenu).toBeVisible();
    await expect(slashMenu).toContainText("状态");
    await composer.press("Tab");
    await expect(slashMenu).toHaveCount(0);
    await expect(composer).toHaveValue("Need a quick check /status");

    await composer.fill("/thinking");
    const optionsMenu = window.getByTestId("slash-options-menu");
    await expect(optionsMenu).toBeVisible();
    await expect(optionsMenu).toContainText("低");
    await expect(optionsMenu).toContainText("超高");
    await composer.press("ArrowDown");
    await composer.press("ArrowDown");
    await composer.press("Enter");
    await expect(optionsMenu).toHaveCount(0);
    await expect(window.getByTestId("transcript")).toContainText("推理强度已设置为 high");
    await expect(window.locator(".composer__hint")).toContainText("high");

    await composer.fill("Keep the draft /thinking");
    await expect(optionsMenu).toBeVisible();
    await composer.press("ArrowDown");
    await composer.press("Enter");
    await expect(optionsMenu).toHaveCount(0);
    await expect(composer).toHaveValue("Keep the draft /thinking medium");

    const selectedWorkspaceId = (await getDesktopState(window)).selectedWorkspaceId;
    expect(selectedWorkspaceId).toBeTruthy();
    await window.evaluate(async ({ workspaceId }) => {
      const app = window.piApp;
      if (!app) {
        throw new Error("piApp IPC bridge is unavailable");
      }
      await app.setScopedModelPatterns(workspaceId, ["fake-provider/fake-model"]);
    }, { workspaceId: selectedWorkspaceId });

    await composer.fill("/model");
    await expect(optionsMenu).toBeVisible();
    await expect(optionsMenu).toContainText("没有可用模型");
    await expect(optionsMenu).toContainText("请到 设置 > 模型 启用模型。");
    await composer.fill("continue");
    await expect(optionsMenu).toHaveCount(0);

    const onboardingNotice = window.getByTestId("model-onboarding-notice");
    await expect(onboardingNotice).toContainText("没有可用模型");
    await expect(onboardingNotice).toContainText("设置 > 模型");
    await expect(window.getByTestId("send")).toBeDisabled();

    await onboardingNotice.getByRole("button", { name: "打开 设置 > 模型" }).click();
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await expect(window.locator(".view-header__title")).toHaveText("模型");
    await openConversationView(window);
    await expect(window.getByTestId("send")).toBeDisabled();

    const appRegions = await window.evaluate(() => {
      const topbar = document.querySelector<HTMLElement>("[data-testid='topbar']");
      const addFolder = document.querySelector<HTMLElement>(".topbar__actions button");
      return {
        topbar: topbar ? getComputedStyle(topbar).getPropertyValue("-webkit-app-region") : "",
        addFolder: addFolder ? getComputedStyle(addFolder).getPropertyValue("-webkit-app-region") : "",
      };
    });
    expect(appRegions.topbar).toBe("drag");
    expect(appRegions.addFolder).toBe("no-drag");

    const maximizedBefore = await harness.electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false;
    });
    await window.getByTestId("topbar").dblclick({ position: { x: 140, y: 12 } });
    await expect
      .poll(() =>
        harness.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMaximized() ?? false),
      )
      .toBe(!maximizedBefore);
  } finally {
    await harness.close();
  }
});

test("dark mode keeps the send button visible before and after typing", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("dark-send-button-workspace");
  await seedAgentDir(agentDir);
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Dark send button session");

    await window.keyboard.press(desktopShortcut(","));
    const settingsSurface = window.getByTestId("settings-surface");
    await expect(settingsSurface).toBeVisible();
    await window.getByRole("button", { name: "外观", exact: true }).click();
    await expect(window.locator(".view-header__title")).toHaveText("外观");
    await window.getByLabel("Pi 原生").click();
    await expect
      .poll(async () => (await getDesktopState(window)).appearanceTheme === "pi-native")
      .toBe(true);
    await expect(window.getByLabel("Pi 原生")).toBeChecked();
    await window.getByLabel("深色").click();
    await expect
      .poll(() => window.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    await openConversationView(window);
    await selectSession(window, "Dark send button session");

    const sendButton = window.getByTestId("send");
    await expect(sendButton).toBeDisabled();
    await expect
      .poll(async () => {
        const styles = await sendButton.evaluate((button) => {
          const computed = getComputedStyle(button);
          return {
            backgroundColor: computed.backgroundColor,
            color: computed.color,
          };
        });
        return contrastRatio(styles.color, styles.backgroundColor);
      })
      .toBeGreaterThan(3);

    await window.getByTestId("composer").fill("make the arrow visible");
    await expect(sendButton).toBeEnabled();
    await expect
      .poll(async () => {
        const styles = await sendButton.evaluate((button) => {
          const computed = getComputedStyle(button);
          return {
            backgroundColor: computed.backgroundColor,
            color: computed.color,
          };
        });
        return contrastRatio(styles.color, styles.backgroundColor);
      })
      .toBeGreaterThan(4.5);
  } finally {
    await harness.close();
  }
});
