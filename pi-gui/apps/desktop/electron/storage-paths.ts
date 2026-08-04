import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const WINDOWS_PI_ROOT = "S:/tool/pi";
export const WINDOWS_PI_GUI_USER_DATA_DIR = "S:/tool/pi/gui-data";
export const WINDOWS_PI_TEMP_DIR = "S:/tool/pi/tmp";

interface ResolvePiGuiStoragePathsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly pathExists?: (path: string) => boolean;
}

function normalizePath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? resolve(trimmed) : undefined;
}

export function resolvePiGuiStoragePaths(options: ResolvePiGuiStoragePathsOptions = {}): {
  readonly userDataDir?: string;
  readonly tempDir?: string;
} {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathExists = options.pathExists ?? existsSync;
  const explicitUserDataDir = normalizePath(env.PI_APP_USER_DATA_DIR);
  const explicitTempDir = normalizePath(env.PI_GUI_TEMP_DIR);

  if (platform === "win32" && pathExists(resolve(WINDOWS_PI_ROOT))) {
    return {
      userDataDir: explicitUserDataDir ?? resolve(WINDOWS_PI_GUI_USER_DATA_DIR),
      tempDir: explicitTempDir ?? resolve(WINDOWS_PI_TEMP_DIR),
    };
  }
  return {
    ...(explicitUserDataDir ? { userDataDir: explicitUserDataDir } : {}),
    ...(explicitTempDir ? { tempDir: explicitTempDir } : {}),
  };
}
