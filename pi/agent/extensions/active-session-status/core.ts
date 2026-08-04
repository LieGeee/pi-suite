import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ActiveSessionMarker {
  readonly version: 1;
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly heartbeatAt: string;
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function writeActiveSessionMarker(
  directory: string,
  marker: ActiveSessionMarker,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const markerPath = join(directory, `${safeFilePart(marker.sessionId)}.${marker.pid}.json`);
  const temporaryPath = `${markerPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(marker)}\n`, "utf8");
  await rm(markerPath, { force: true });
  await rename(temporaryPath, markerPath);
  return markerPath;
}

export async function removeActiveSessionMarker(markerPath: string | undefined): Promise<void> {
  if (!markerPath) return;
  await rm(markerPath, { force: true });
}

export async function readActiveSessionMarker(markerPath: string): Promise<ActiveSessionMarker> {
  return JSON.parse(await readFile(markerPath, "utf8")) as ActiveSessionMarker;
}
