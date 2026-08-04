import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
  removeActiveSessionMarker,
  writeActiveSessionMarker,
  type ActiveSessionMarker,
} from "./core.js";

const HEARTBEAT_INTERVAL_MS = 5_000;
const MARKER_DIRECTORY = "active-sessions";

export default function activeSessionStatus(pi: ExtensionAPI): void {
  const directory = join(getAgentDir(), MARKER_DIRECTORY);
  let markerPath: string | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let activeMarker: Omit<ActiveSessionMarker, "heartbeatAt"> | undefined;
  let heartbeatWrite: Promise<void> = Promise.resolve();
  let generation = 0;

  async function clearMarker(): Promise<void> {
    generation += 1;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    const currentPath = markerPath;
    markerPath = undefined;
    activeMarker = undefined;
    await heartbeatWrite.catch(() => undefined);
    await removeActiveSessionMarker(currentPath).catch((error) => {
      console.error("[active-session-status] Failed to remove marker:", error);
    });
  }

  async function updateHeartbeat(expectedGeneration: number): Promise<void> {
    const marker = activeMarker;
    if (!marker || expectedGeneration !== generation) return;
    const writtenPath = await writeActiveSessionMarker(directory, {
      ...marker,
      heartbeatAt: new Date().toISOString(),
    });
    if (expectedGeneration !== generation || marker !== activeMarker) {
      await removeActiveSessionMarker(writtenPath);
      return;
    }
    markerPath = writtenPath;
  }

  function queueHeartbeat(expectedGeneration: number): Promise<void> {
    heartbeatWrite = heartbeatWrite.catch(() => undefined).then(() => updateHeartbeat(expectedGeneration));
    return heartbeatWrite;
  }

  async function startMarker(ctx: ExtensionContext): Promise<void> {
    await clearMarker();
    const sessionFile = ctx.sessionManager.getSessionFile();
    if (!sessionFile) return;
    const startedAt = new Date().toISOString();
    activeMarker = {
      version: 1,
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile,
      cwd: ctx.cwd,
      pid: process.pid,
      startedAt,
    };
    const activeGeneration = generation;
    await queueHeartbeat(activeGeneration);
    if (activeGeneration !== generation) return;
    heartbeatTimer = setInterval(() => {
      void queueHeartbeat(activeGeneration).catch((error) => {
        console.error("[active-session-status] Failed to update heartbeat:", error);
      });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
  }

  pi.on("agent_start", async (_event, ctx) => {
    await startMarker(ctx);
  });

  pi.on("agent_end", async () => {
    await clearMarker();
  });

  pi.on("session_shutdown", async () => {
    await clearMarker();
  });
}
