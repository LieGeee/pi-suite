import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  selectSession,
  waitForSessionByTitle,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

const { SessionManager } = (await import(
  "../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"
)) as {
  SessionManager: {
    create(cwd: string): {
      appendMessage(message: { role: "user" | "assistant"; content: string; timestamp: number }): string;
      appendSessionInfo(name: string): string;
      getSessionFile(): string | undefined;
    };
    open(path: string): {
      appendMessage(message: { role: "user" | "assistant"; content: string; timestamp: number }): string;
    };
  };
};

test("reloads terminal-appended messages when pi-gui reopens the same session", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("terminal-session-refresh");
  const agentDir = join(userDataDir, "agent");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const terminalSession = SessionManager.create(workspacePath);
    terminalSession.appendMessage({ role: "user", content: "terminal initial question", timestamp: Date.now() });
    terminalSession.appendMessage({ role: "assistant", content: "terminal initial answer", timestamp: Date.now() + 1 });
    terminalSession.appendSessionInfo("Terminal refresh fixture");
    const sessionFile = terminalSession.getSessionFile();
    if (!sessionFile) throw new Error("Terminal fixture session was not persisted.");

    let harness = await launchDesktop(userDataDir, {
      initialWorkspaces: [workspacePath],
      testMode: "background",
    });
    try {
      const window = await harness.firstWindow();
      const workspace = await waitForWorkspaceByPath(window, workspacePath);
      await waitForSessionByTitle(window, workspace.id, "Terminal refresh fixture");
      await selectSession(window, "Terminal refresh fixture");
      await expect(window.getByText("terminal initial answer", { exact: true })).toBeVisible();
    } finally {
      await harness.close();
    }

    const terminalAfterGuiClose = SessionManager.open(sessionFile);
    terminalAfterGuiClose.appendMessage({ role: "user", content: "terminal appended question", timestamp: Date.now() + 2 });
    terminalAfterGuiClose.appendMessage({ role: "assistant", content: "terminal appended answer", timestamp: Date.now() + 3 });

    harness = await launchDesktop(userDataDir, {
      initialWorkspaces: [workspacePath],
      testMode: "background",
    });
    try {
      const window = await harness.firstWindow();
      const workspace = await waitForWorkspaceByPath(window, workspacePath);
      await waitForSessionByTitle(window, workspace.id, "Terminal refresh fixture");
      await selectSession(window, "Terminal refresh fixture");
      await expect(window.getByText("terminal appended answer", { exact: true })).toBeVisible();
    } finally {
      await harness.close();
    }
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
  }
});
