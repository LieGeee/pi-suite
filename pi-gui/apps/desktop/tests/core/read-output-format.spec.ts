import { expect, test } from "@playwright/test";
import { createNamedThread, emitTestSessionEvent, launchDesktop, makeUserDataDir, makeWorkspace } from "../helpers/electron-app";
import type { SessionDriverEvent } from "@pi-gui/session-driver";
import { getDesktopState } from "../helpers/electron-app";

test("read tool output renders extracted text instead of raw JSON blobs", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("read-output-format-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Read output formatting", { workspaceName: "read-output-format-workspace" });
    const state = await getDesktopState(window);
    const sessionRef = { workspaceId: state.selectedWorkspaceId, sessionId: state.selectedSessionId };

    const startedEvent: Extract<SessionDriverEvent, { type: "toolStarted" }> = {
      type: "toolStarted",
      sessionRef,
      timestamp: new Date().toISOString(),
      toolName: "Read",
      callId: "read-format-1",
      input: { file_path: "src/index.ts" },
    };
    await emitTestSessionEvent(harness, startedEvent);

    const finishedEvent: Extract<SessionDriverEvent, { type: "toolFinished" }> = {
      type: "toolFinished",
      sessionRef,
      timestamp: new Date().toISOString(),
      callId: "read-format-1",
      success: true,
      output: {
        content: [
          {
            type: "text",
            text: "line one\nline two\nconst demo = true;",
          },
        ],
      },
    };
    await emitTestSessionEvent(harness, finishedEvent);

    await window.locator(".timeline-tool__header").last().click();
    const toolBody = window.locator(".timeline-tool__pre").last();
    await expect(toolBody).toContainText("line one");
    await expect(toolBody).toContainText("line two");
    await expect(toolBody).toContainText("const demo = true;");
    await expect(toolBody).not.toContainText('"content"');
    await expect(toolBody).not.toContainText('"type"');
  } finally {
    await harness.close();
  }
});
