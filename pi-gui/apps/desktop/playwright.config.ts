import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

if (process.platform === "win32" && existsSync(resolve("S:/tool/pi"))) {
  const tempDir = resolve("S:/tool/pi/tmp");
  mkdirSync(tempDir, { recursive: true });
  process.env.PI_GUI_TEMP_DIR = tempDir;
  process.env.TEMP = tempDir;
  process.env.TMP = tempDir;
  process.env.TMPDIR = tempDir;
}

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  // Electron user-surface tests are materially more reliable when one app owns the input loop at a time.
  workers: 1,
  retries: process.env.PI_APP_TEST_MODE === "foreground" ? 1 : 0,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
