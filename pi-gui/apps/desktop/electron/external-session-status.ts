import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceRecord } from "../src/desktop-state";

export interface ActiveSessionMarker {
  readonly version: 1;
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly heartbeatAt: string;
}

interface ResolveMarkerOptions {
  readonly nowMs?: number;
  readonly maxAgeMs?: number;
  readonly isProcessAlive?: (pid: number) => boolean;
}

const DEFAULT_MAX_AGE_MS = 15_000;

function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isMarker(value: unknown): value is ActiveSessionMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<ActiveSessionMarker>;
  return marker.version === 1
    && typeof marker.sessionId === "string"
    && Boolean(marker.sessionId)
    && typeof marker.sessionFile === "string"
    && typeof marker.cwd === "string"
    && typeof marker.pid === "number"
    && typeof marker.startedAt === "string"
    && typeof marker.heartbeatAt === "string";
}

export function resolveActiveSessionMarkers(
  markers: readonly unknown[],
  options: ResolveMarkerOptions = {},
): ReadonlyMap<string, ActiveSessionMarker> {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const active = new Map<string, ActiveSessionMarker>();

  for (const candidate of markers) {
    if (!isMarker(candidate)) continue;
    const heartbeatMs = Date.parse(candidate.heartbeatAt);
    if (!Number.isFinite(heartbeatMs) || nowMs - heartbeatMs > maxAgeMs || !isProcessAlive(candidate.pid)) continue;
    const existing = active.get(candidate.sessionId);
    if (!existing || Date.parse(existing.heartbeatAt) < heartbeatMs) {
      active.set(candidate.sessionId, candidate);
    }
  }
  return active;
}

export async function readActiveSessionMarkers(
  directory: string,
  options: ResolveMarkerOptions = {},
): Promise<ReadonlyMap<string, ActiveSessionMarker>> {
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  const values = await Promise.all(names.map(async (name) => {
    try {
      return JSON.parse(await readFile(join(directory, name), "utf8")) as unknown;
    } catch {
      return undefined;
    }
  }));
  return resolveActiveSessionMarkers(values, options);
}

export function activeSessionSignature(active: ReadonlyMap<string, ActiveSessionMarker>): string {
  return [...active.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sessionId, marker]) => `${sessionId}\u0000${marker.pid}\u0000${marker.startedAt}`)
    .join("\n");
}

export function applyExternalRunningStatuses(
  workspaces: readonly WorkspaceRecord[],
  active: ReadonlyMap<string, ActiveSessionMarker>,
): readonly WorkspaceRecord[] {
  if (active.size === 0) return workspaces;
  return workspaces.map((workspace) => {
    let changed = false;
    const sessions = workspace.sessions.map((session) => {
      const marker = active.get(session.id);
      if (!marker) return session;
      changed = true;
      return {
        ...session,
        status: "running" as const,
        runningSince: marker.startedAt,
      };
    });
    return changed ? { ...workspace, sessions } : workspace;
  });
}
