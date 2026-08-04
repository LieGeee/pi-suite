import { existsSync } from "node:fs";
import { join, normalize } from "node:path";

const PATH_KEYS = ["PATH", "Path", "path"] as const;

export function applyGuiNpmPath(): string | undefined {
  const pathKey = PATH_KEYS.find((key) => typeof process.env[key] === "string") ?? "PATH";
  const currentPath = process.env[pathKey] ?? "";
  const nextPath = buildAugmentedPath(
    currentPath,
    resolveWindowsNpmPathCandidates(process.env),
    existsSync,
  );
  if (nextPath !== currentPath) {
    process.env[pathKey] = nextPath;
  }
  return nextPath;
}

export function buildAugmentedPath(
  currentPath: string,
  candidates: readonly string[],
  pathExists: (candidate: string) => boolean,
): string {
  const separator = process.platform === "win32" ? ";" : ":";
  const existingParts = currentPath.split(separator).filter(Boolean);
  const existingKeys = new Set(existingParts.map(normalizePathKey));
  const additions: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    const key = normalizePathKey(normalized);
    if (existingKeys.has(key) || additions.some((entry) => normalizePathKey(entry) === key)) {
      continue;
    }
    if (pathExists(normalized)) {
      additions.push(normalized);
    }
  }
  return [...additions, ...existingParts].join(separator);
}

export function resolveWindowsNpmPathCandidates(env: NodeJS.ProcessEnv): readonly string[] {
  const candidates = [
    env.APPDATA ? join(env.APPDATA, "npm") : undefined,
    env.ProgramFiles ? join(env.ProgramFiles, "nodejs") : undefined,
    env["ProgramFiles(x86)"] ? join(env["ProgramFiles(x86)"], "nodejs") : undefined,
    env.USERPROFILE ? join(env.USERPROFILE, "AppData", "Roaming", "npm") : undefined,
    "C:/Program Files/nodejs",
  ];
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function normalizePathKey(value: string): string {
  return normalize(value).replace(/\\+$/g, "").toLowerCase();
}
