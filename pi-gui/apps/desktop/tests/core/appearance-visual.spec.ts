import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
  type PiAppWindow,
} from "../helpers/electron-app";

test("三套主题视觉回归截图与像素验证", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("appearance-visual");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
    envOverrides: { PI_APP_DEFAULT_SIDEBAR_TAB: "conversations" },
  });

  try {
    const window = await harness.firstWindow();
    await harness.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    await waitForWorkspaceByPath(window, workspacePath);

    // 进入 new-thread
    await window.evaluate(async () => {
      const app = (window as PiAppWindow).piApp;
      if (!app) throw new Error("piApp 不可用");
      await app.setActiveView("new-thread");
    });

    await expect(window.getByRole("heading", { name: "今天想构建什么？" })).toBeVisible();
    await expect(window.locator(".new-thread__quick-actions button")).toHaveCount(4);
    await expect(window.locator(".new-thread__project-bar")).toBeVisible();
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();

    const themes = ["miku-dream", "pure-white", "pi-native"] as const;
    const screenshotBuffers: Buffer[] = [];
    const sha256s: string[] = [];

    for (const theme of themes) {
      // 设置主题
      await window.evaluate(async (themeId) => {
        const app = (window as PiAppWindow).piApp;
        if (!app) throw new Error("piApp 不可用");
        await app.setAppearanceTheme(themeId);
      }, theme);

      // 等待 data-appearance-theme 生效
      await expect
        .poll(async () => window.evaluate(() => document.documentElement.dataset.appearanceTheme))
        .toBe(theme);

      // 留出渲染时间
      await window.waitForTimeout(1500);

      // 截图
      const screenshot = await window.screenshot({ type: "png" });
      screenshotBuffers.push(screenshot);

      const pngPath = testInfo.outputPath(`${theme}.png`);
      await writeFile(pngPath, screenshot);
      await testInfo.attach(`${theme}-screenshot`, { path: pngPath });

      sha256s.push(createHash("sha256").update(screenshot).digest("hex"));

      // 每主题 eyebrow 验证
      const mikuDisplay = await window.evaluate(() => {
        const el = document.querySelector(".new-thread__eyebrow-miku");
        return el ? getComputedStyle(el).display : "missing";
      });
      const defaultDisplay = await window.evaluate(() => {
        const el = document.querySelector(".new-thread__eyebrow-default");
        return el ? getComputedStyle(el).display : "missing";
      });

      if (theme === "miku-dream") {
        // 验证 shell backgroundImage 包含 miku-hero
        const shellBg = await window.evaluate(() => {
          const shell = document.querySelector(".shell");
          if (!shell) return "";
          return getComputedStyle(shell).backgroundImage || "";
        });
        expect(shellBg).toContain("miku-hero");

        expect(mikuDisplay).not.toBe("none");
        expect(defaultDisplay).toBe("none");
      } else {
        expect(mikuDisplay).toBe("none");
        expect(defaultDisplay).not.toBe("none");
      }
    }

    // 通过 nativeImage 验证截图像素质量
    const validationResults = await harness.electronApp.evaluate(
      ({ nativeImage }, encodedPngs: readonly string[]) => {
        return encodedPngs.map((b64) => {
          const buf = Buffer.from(b64, "base64");
          const img = nativeImage.createFromBuffer(buf);
          const size = img.getSize();
          const bitmap = img.getBitmap();
          if (!bitmap) {
            return {
              error: "getBitmap returned null",
              width: size.width,
              height: size.height,
              alphaNonEmpty: false,
              uniqueColors: 0,
              rRange: 0,
              gRange: 0,
              bRange: 0,
            };
          }

          const width = size.width;
          const height = size.height;
          const pixels = width * height;
          let alphaNonEmpty = false;
          const colorSet = new Set<number>();
          let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;

          for (let i = 0; i < pixels; i++) {
            const offset = i * 4;
            const r = bitmap[offset];
            const g = bitmap[offset + 1];
            const b = bitmap[offset + 2];
            const a = bitmap[offset + 3];

            if (a > 0) alphaNonEmpty = true;

            // 每 10 像素采样一次减少计算量
            if (i % 10 === 0) {
              colorSet.add((r << 16) | (g << 8) | b);
            }

            if (r < rMin) rMin = r;
            if (r > rMax) rMax = r;
            if (g < gMin) gMin = g;
            if (g > gMax) gMax = g;
            if (b < bMin) bMin = b;
            if (b > bMax) bMax = b;
          }

          return {
            error: null,
            width,
            height,
            alphaNonEmpty,
            uniqueColors: colorSet.size,
            rRange: rMax - rMin,
            gRange: gMax - gMin,
            bRange: bMax - bMin,
            rMin,
            rMax,
            gMin,
            gMax,
            bMin,
            bMax,
          };
        });
      },
      screenshotBuffers.map((b) => b.toString("base64")),
    );

    for (const [i, result] of validationResults.entries()) {
      expect
        .soft(result.error, `${themes[i]} nativeImage 解码错误`)
        .toBeNull();
      expect
        .soft(result.width, `${themes[i]} 截图宽度`)
        .toBeGreaterThanOrEqual(1200);
      expect
        .soft(result.height, `${themes[i]} 截图高度`)
        .toBeGreaterThanOrEqual(760);
      expect
        .soft(result.alphaNonEmpty, `${themes[i]} alpha 通道为空`)
        .toBe(true);
      expect
        .soft(result.uniqueColors, `${themes[i]} 独特颜色数`)
        .toBeGreaterThanOrEqual(24);
      // 至少一个 RGB channel range >= 60
      const maxRange = Math.max(result.rRange, result.gRange, result.bRange);
      expect
        .soft(maxRange, `${themes[i]} 最大 RGB channel range`)
        .toBeGreaterThanOrEqual(60);
    }

    // 三张截图 SHA-256 必须互不相同
    expect(sha256s[0]).not.toBe(sha256s[1]);
    expect(sha256s[0]).not.toBe(sha256s[2]);
    expect(sha256s[1]).not.toBe(sha256s[2]);

    // 布局：h1、quick actions、project bar、composer 均在 viewport 内且互不重叠
    const geometry = await window.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error(`缺少 ${selector}`);
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      return {
        hero: rect(".new-thread__hero"),
        actions: rect(".new-thread__quick-actions"),
        project: rect(".new-thread__project-bar"),
        composer: rect(".new-thread__composer"),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    expect(geometry.hero.bottom).toBeLessThanOrEqual(geometry.actions.top + 1);
    expect(geometry.actions.bottom).toBeLessThanOrEqual(geometry.project.top + 1);
    expect(geometry.project.bottom).toBeLessThanOrEqual(geometry.composer.top + 1);
    expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
    expect(geometry.horizontalOverflow).toBe(false);
  } finally {
    await harness.close();
  }
});
