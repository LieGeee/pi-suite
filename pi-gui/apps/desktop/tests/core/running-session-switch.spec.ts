import { expect, test } from "@playwright/test";
import type { SessionDriverEvent, SessionRef } from "@pi-gui/session-driver";
import { createNamedThread, emitTestSessionEvent, getDesktopState, launchDesktop, makeUserDataDir, makeWorkspace, selectSession } from "../helpers/electron-app";

function sessionRefForTitle(state: Awaited<ReturnType<typeof getDesktopState>>, title: string): SessionRef {
  for (const workspace of state.workspaces) {
    const session = workspace.sessions.find((entry) => entry.title === title);
    if (session) {
      return { workspaceId: workspace.id, sessionId: session.id };
    }
  }
  throw new Error(`Missing session: ${title}`);
}

test("can switch to another session while the current session is still running", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("running-switch-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "任务A");
    await createNamedThread(window, "任务B");

    let state = await getDesktopState(window);
    const sessionA = sessionRefForTitle(state, "任务A");
    const sessionB = sessionRefForTitle(state, "任务B");

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
          displayName: "running-switch-workspace",
        },
        title: "任务A",
        status: "running",
        updatedAt: new Date().toISOString(),
        preview: "正在处理中",
        runningRunId: "run-a",
      },
    };
    await emitTestSessionEvent(harness, started);

    await selectSession(window, "任务B");
    await expect.poll(async () => (await getDesktopState(window)).selectedSessionId).toBe(sessionB.sessionId);

    const followUp: Extract<SessionDriverEvent, { type: "assistantDelta" }> = {
      type: "assistantDelta",
      sessionRef: sessionA,
      timestamp: new Date().toISOString(),
      runId: "run-a",
      text: "任务A 后续输出",
    };
    await emitTestSessionEvent(harness, followUp);

    await expect.poll(async () => (await getDesktopState(window)).selectedSessionId).toBe(sessionB.sessionId);
    await expect(window.locator(".chat-header__title")).toHaveText("任务B");
  } finally {
    await harness.close();
  }
});
