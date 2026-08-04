import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

const installedExecutable = "S:/tool/pi-gui/pi-gui.exe";

test("installed Windows app uses production storage and current appearance layout", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_APP_OPEN_DEVTOOLS: "0",
    PI_APP_TEST_MODE: "background",
  };
  delete env.PI_APP_USER_DATA_DIR;
  delete env.PI_CODING_AGENT_DIR;
  delete env.PI_GUI_AGENT_DIR;
  delete env.PI_GUI_TEMP_DIR;

  const electronApp = await electron.launch({
    executablePath: installedExecutable,
    cwd: "S:/tool/pi-gui",
    env,
  });

  try {
    const window = await electronApp.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });
    await window.waitForLoadState("domcontentloaded");
    const paths = await electronApp.evaluate(({ app }) => ({
      userData: app.getPath("userData"),
      temp: app.getPath("temp"),
      agent: process.env.PI_CODING_AGENT_DIR ?? "",
      envTemp: process.env.TEMP ?? "",
      envTmp: process.env.TMP ?? "",
      envTmpDir: process.env.TMPDIR ?? "",
      execPath: process.execPath,
    }));
    expect(normalizePath(paths.userData)).toBe("s:/tool/pi/gui-data");
    expect(normalizePath(paths.temp)).toBe("s:/tool/pi/tmp");
    expect(normalizePath(paths.agent)).toBe("s:/tool/pi/agent");
    expect(normalizePath(paths.envTemp)).toBe("s:/tool/pi/tmp");
    expect(normalizePath(paths.envTmp)).toBe("s:/tool/pi/tmp");
    expect(normalizePath(paths.envTmpDir)).toBe("s:/tool/pi/tmp");
    expect(normalizePath(paths.execPath)).toBe("s:/tool/pi-gui/pi-gui.exe");

    const productionState = await window.evaluate(async () => {
      const app = window.piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setAppearanceTheme("miku-dream");
      await app.setSidebarTab("conversations");
      const state = await app.setActiveView("new-thread");
      const miku = state.appearanceThemes.find((theme) => theme.id === "miku-dream");
      if (!miku?.heroImageUrl) throw new Error("安装版 Miku 横幅不可用");
      const image = new Image();
      image.src = miku.heroImageUrl;
      await image.decode();
      return {
        themeIds: state.appearanceThemes.map((theme) => theme.id),
        appearanceTheme: state.appearanceTheme,
        sidebarTab: state.sidebarTab,
        heroImageUrl: miku.heroImageUrl,
        heroWidth: image.naturalWidth,
        workspaceCount: state.workspaces.length,
        sessionCount: state.workspaces.reduce((count, workspace) => count + workspace.sessions.length, 0),
      };
    });

    expect(productionState.themeIds).toEqual(["miku-dream", "pure-white", "pi-native"]);
    expect(productionState.appearanceTheme).toBe("miku-dream");
    expect(productionState.sidebarTab).toBe("conversations");
    expect(productionState.heroImageUrl).toMatch(/^file:\/\/\/S:\/tool\/pi\/gui-data\/themes\//i);
    expect(productionState.heroWidth).toBeGreaterThan(1_000);
    expect(productionState.workspaceCount).toBeGreaterThan(0);
    expect(productionState.sessionCount).toBeGreaterThan(0);
    await expect(window.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    await expect(window.getByTestId("conversation-sidebar")).toBeVisible();
    await expect(window.locator(".new-thread__quick-actions button")).toHaveCount(4);

    await window.evaluate(async () => {
      const app = window.piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setAppearanceTheme("pure-white");
      await app.setThemeMode("dark");
    });
    await expect.poll(() => window.evaluate(() => document.documentElement.dataset.appearanceTheme)).toBe("pure-white");
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    await window.evaluate(async () => {
      const app = window.piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setAppearanceTheme("pi-native");
    });
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

    await window.evaluate(async () => {
      const app = window.piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setThemeMode("system");
      await app.setAppearanceTheme("miku-dream");
    });
    await expect.poll(() => window.evaluate(() => document.documentElement.dataset.appearanceTheme)).toBe("miku-dream");
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    const screenshotPath = testInfo.outputPath("installed-miku-dream.png");
    await window.screenshot({ path: screenshotPath, timeout: 60_000 });
    await testInfo.attach("installed-miku-dream", { path: screenshotPath, contentType: "image/png" });
  } finally {
    await electronApp.close();
  }
});

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
