import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("在中文外观设置中切换并持久化共享布局主题", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("appearance-theme-preset");
  let harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await window.keyboard.press(desktopShortcut(","));
    await window.getByRole("button", { name: "外观", exact: true }).click();
    const pureWhiteRadio = window.getByLabel("纯白");
    await pureWhiteRadio.click();

    await expect.poll(async () => (await getDesktopState(window)).appearanceTheme).toBe("pure-white");
    await expect(pureWhiteRadio).toBeChecked();
    await expect.poll(() => rootAppearanceTheme(window)).toBe("pure-white");
    await expect
      .poll(async () => {
        const persisted = JSON.parse(await readFile(join(userDataDir, "ui-state.json"), "utf8")) as {
          readonly version?: unknown;
          readonly appearanceTheme?: unknown;
        };
        return `${persisted.version}:${persisted.appearanceTheme}`;
      })
      .toBe("13:pure-white");
  } finally {
    await harness.close();
  }

  harness = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expect.poll(async () => (await getDesktopState(window)).appearanceTheme).toBe("pure-white");
    await expect.poll(() => rootAppearanceTheme(window)).toBe("pure-white");
  } finally {
    await harness.close();
  }
});

test("只有 Pi 原生主题跟随深色模式", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("appearance-theme-dark-isolation");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await window.evaluate(async () => {
      if (!window.piApp) throw new Error("piApp 不可用");
      await window.piApp.setThemeMode("dark");
      await window.piApp.setAppearanceTheme("miku-dream");
    });
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);

    await window.evaluate(async () => {
      if (!window.piApp) throw new Error("piApp 不可用");
      await window.piApp.setAppearanceTheme("pi-native");
    });
    await expect.poll(() => window.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  } finally {
    await harness.close();
  }
});

async function rootAppearanceTheme(window: { evaluate<R>(pageFunction: () => R): Promise<R> }): Promise<string | null> {
  return window.evaluate(() => document.documentElement.getAttribute("data-appearance-theme"));
}
