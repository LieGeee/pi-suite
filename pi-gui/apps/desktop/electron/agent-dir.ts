import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const WINDOWS_S_DRIVE_AGENT_DIR = "S:/tool/pi/agent";
const PI_GUI_AGENT_DIR_ENV = "PI_GUI_AGENT_DIR";
const PI_CODING_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

interface ResolvePreferredPiAgentDirOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly pathExists?: (path: string) => boolean;
}

function normalizeCandidate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return resolve(trimmed);
}

export function resolvePreferredPiAgentDir(
  options: ResolvePreferredPiAgentDirOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const pathExists = options.pathExists ?? existsSync;

  const explicitCandidate = normalizeCandidate(env[PI_CODING_AGENT_DIR_ENV]);
  if (explicitCandidate) {
    return explicitCandidate;
  }

  const desktopCandidate = normalizeCandidate(env[PI_GUI_AGENT_DIR_ENV]);
  if (desktopCandidate) {
    return desktopCandidate;
  }

  if (process.platform === "win32") {
    const sDriveCandidate = normalizeCandidate(WINDOWS_S_DRIVE_AGENT_DIR);
    if (sDriveCandidate && pathExists(sDriveCandidate)) {
      return sDriveCandidate;
    }
  }

  return undefined;
}

export function applyPreferredPiAgentDir(): string | undefined {
  const preferred = resolvePreferredPiAgentDir();
  if (!preferred) {
    return undefined;
  }
  process.env[PI_CODING_AGENT_DIR_ENV] = preferred;
  return preferred;
}
