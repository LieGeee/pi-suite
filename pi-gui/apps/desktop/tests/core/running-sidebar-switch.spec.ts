import { expect, test } from "@playwright/test";
import type { SessionDriverEvent, SessionRef } from "@pi-gui/session-driver";
import { createNamedThread, emitTestSessionEvent, getDesktopState, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";

function sessionRefForTitle(state: Awaited<ReturnType<typeof getDesktopState>>, title: string): SessionRef {
  for (const workspace of state.workspaces) {
    const session = workspace.sessions.find((entry) => entry.title === title);
    if (session) {
      return { workspaceId: workspace.id, sessionId: session.id };
    }
  }
  throw new Error(`Missing session: ${title}`);
}

test("can click another sidebar task while current task is running", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("running-sidebar-switch-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "任务A");
    await createNamedThread(window, "任务B");

    const state = await getDesktopState(window);
    const sessionA = sessionRefForTitle(state, "任务A");

    const started: Extract<SessionDriverEvent, { type: "sessionUpdated" }> = {
      type: "sessionUpdated",
      sessionRef: sessionA,
      timestamp: new Date().toISOString(),
      runId: "run-a",
      snapshot: {
        ref: sessionA,
        workspace: {
          workspaceId: sessionA.workspaceId,
          path: workspacePath,
          displayName: "running-sidebar-switch-workspace",
        },
        title: "任务A",
        status: "running",
        updatedAt: new Date().toISOString(),
        preview: "正在处理中",
        runningRunId: "run-a",
      },
    };
    await emitTestSessionEvent(harness, started);

    const targetRow = window.locator('.session-row', { hasText: '任务B' }).first();
    await expect(targetRow).toBeVisible();
    await targetRow.click();

    await expect(window.locator('.chat-header__title')).toHaveText('任务B');
    await expect.poll(async () => (await getDesktopState(window)).selectedSessionId).not.toBe(sessionA.sessionId);
  } finally {
    await harness.close();
  }
});
