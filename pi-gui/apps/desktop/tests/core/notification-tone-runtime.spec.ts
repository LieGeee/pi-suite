import { expect, test } from "@playwright/test";
import type { SessionDriverEvent } from "@pi-gui/session-driver";
import { createNamedThread, emitTestSessionEvent, getDesktopState, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";

test("completion events invoke the notification tone pipeline when sound is enabled", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("notification-tone-runtime-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "提示音测试");

    await window.evaluate(() => {
      (window as typeof window & { __PI_TEST_TONES?: string[] }).__PI_TEST_TONES = [];
      const hooks = (window as typeof window & { __piTestHooks?: { clearTones?: () => void } }).__piTestHooks;
      hooks?.clearTones?.();
    });

    const state = await getDesktopState(window);
    const sessionRef = { workspaceId: state.selectedWorkspaceId, sessionId: state.selectedSessionId };
    const event: Extract<SessionDriverEvent, { type: "runCompleted" }> = {
      type: "runCompleted",
      sessionRef,
      timestamp: new Date().toISOString(),
      runId: "sound-run-1",
      snapshot: {
        ref: sessionRef,
        workspace: {
          workspaceId: sessionRef.workspaceId,
          path: workspacePath,
          displayName: "notification-tone-runtime-workspace",
        },
        title: "提示音测试",
        status: "idle",
        updatedAt: new Date().toISOString(),
        preview: "完成",
      },
    };
    await emitTestSessionEvent(harness, event);

    await expect.poll(async () => {
      const nextState = await getDesktopState(window);
      return nextState.lastSessionEvent?.kind ?? null;
    }).toBe("runCompleted");

    await expect.poll(async () => window.evaluate(() => {
      return ((window as typeof window & { __PI_TEST_TONES?: string[] }).__PI_TEST_TONES ?? []).length;
    })).toBeGreaterThan(0);
  } finally {
    await harness.close();
  }
});
