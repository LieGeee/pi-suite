import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { WINDOWS_PI_GUI_USER_DATA_DIR, WINDOWS_PI_TEMP_DIR, resolvePiGuiStoragePaths } from "./storage-paths.ts";

test("uses S drive defaults on Windows", () => {
  assert.deepEqual(resolvePiGuiStoragePaths({ env: {}, platform: "win32", pathExists: (p) => p === path.resolve("S:/tool/pi") }), {
    userDataDir: path.resolve(WINDOWS_PI_GUI_USER_DATA_DIR),
    tempDir: path.resolve(WINDOWS_PI_TEMP_DIR),
  });
});

test("preserves explicit storage overrides", () => {
  assert.deepEqual(resolvePiGuiStoragePaths({ env: { PI_APP_USER_DATA_DIR: "D:/data", PI_GUI_TEMP_DIR: "D:/temp" }, platform: "win32", pathExists: () => true }), {
    userDataDir: path.resolve("D:/data"), tempDir: path.resolve("D:/temp"),
  });
});
