import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchPackagedDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("packaged app loads the declarative theme pack and shared layout", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const userDataDir = await makeUserDataDir("pi-gui-packaged-appearance-");
  const workspacePath = await makeWorkspace("packaged-appearance-workspace");
  const themeRoot = join(userDataDir, "themes");
  await mkdir(join(themeRoot, "assets"), { recursive: true });
  await copyFile(
    resolve(__dirname, "../../src/assets/miku-hero.jpg"),
    join(themeRoot, "assets", "miku-hero.jpg"),
  );
  await writeFile(join(themeRoot, "manifest.json"), `${JSON.stringify({
    version: 1,
    themes: [{
      id: "miku-dream",
      name: "Miku Dream Packaged",
      description: "Packaged declarative theme test",
      heroImage: "assets/miku-hero.jpg",
      variables: { "--accent": "#12b8c4" },
    }],
  }, null, 2)}\n`, "utf8");

  const harness = await launchPackagedDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
    envOverrides: { PI_APP_DEFAULT_SIDEBAR_TAB: "conversations" },
  });
  try {
    const window = await harness.firstWindow();
    await window.setViewportSize({ width: 1440, height: 900 });
    await waitForWorkspaceByPath(window, workspacePath);

    const result = await window.evaluate(async () => {
      const app = window.piApp;
      if (!app) throw new Error("piApp 不可用");
      const state = await app.getState();
      const theme = state.appearanceThemes.find((entry) => entry.id === "miku-dream");
      if (!theme?.heroImageUrl) throw new Error("打包主题横幅不可用");
      const image = new Image();
      image.src = theme.heroImageUrl;
      await image.decode();
      await app.setActiveView("new-thread");
      return {
        themeName: theme.name,
        heroImageUrl: theme.heroImageUrl,
        naturalWidth: image.naturalWidth,
      };
    });

    expect(result.themeName).toBe("Miku Dream Packaged");
    expect(result.heroImageUrl).toMatch(/^file:\/\//);
    expect(result.naturalWidth).toBeGreaterThan(1_000);
    await expect.poll(() => window.evaluate(() => document.documentElement.dataset.appearanceTheme)).toBe("miku-dream");
    await expect(window.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    await expect(window.locator(".new-thread__quick-actions button")).toHaveCount(4);
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect.poll(() => window.locator(".shell").evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("file:");

    const eyebrowDisplay = await window.evaluate(() => ({
      miku: getComputedStyle(document.querySelector(".new-thread__eyebrow-miku")!).display,
      default: getComputedStyle(document.querySelector(".new-thread__eyebrow-default")!).display,
    }));
    expect(eyebrowDisplay.miku).not.toBe("none");
    expect(eyebrowDisplay.default).toBe("none");

    const screenshotPath = testInfo.outputPath("packaged-miku-dream.png");
    await window.screenshot({ path: screenshotPath, timeout: 60_000 });
    await testInfo.attach("packaged-miku-dream", { path: screenshotPath, contentType: "image/png" });
  } finally {
    await harness.close();
  }
});
