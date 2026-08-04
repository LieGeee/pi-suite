import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  getDesktopState,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("refreshing a workspace reloads terminal-appended messages from the shared session file", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("terminal-session-sync");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    const stateAfterCreate = await window.evaluate(async (workspaceId) => {
      const app = window.piApp;
      if (!app) throw new Error("piApp IPC bridge is unavailable");
      return app.createSession({ workspaceId, title: "Terminal sync fixture" });
    }, workspace.id);
    const sessionId = stateAfterCreate.selectedSessionId;

    await getSelectedTranscript(window);
    const sessionFilePath = await sessionFilePathFor(userDataDir, workspace.id, sessionId);
    const { SessionManager } = (await import(
      "../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"
    )) as {
      SessionManager: {
        open(path: string): {
          appendMessage(message: { role: "user"; content: string; timestamp: number }): string;
          _rewriteFile(): void;
        };
      };
    };
    const terminalSession = SessionManager.open(sessionFilePath);
    terminalSession.appendMessage({
      role: "user",
      content: "Message appended by terminal Pi",
      timestamp: Date.now(),
    });
    terminalSession._rewriteFile();

    await window.getByRole("button", { name: "刷新对话", exact: true }).click();

    await expect
      .poll(async () => (await getSelectedTranscript(window))?.transcript.map((message) => message.text))
      .toContain("Message appended by terminal Pi");
  } finally {
    await harness.close();
  }
});

test("reopening pi-gui reads terminal-appended messages from the shared session file", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("terminal-session-reopen");
  let harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  let sessionFilePath = "";

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    const stateAfterCreate = await window.evaluate(async (workspaceId) => {
      const app = window.piApp;
      if (!app) throw new Error("piApp IPC bridge is unavailable");
      return app.createSession({ workspaceId, title: "Terminal reopen fixture" });
    }, workspace.id);
    await getSelectedTranscript(window);
    sessionFilePath = await sessionFilePathFor(userDataDir, workspace.id, stateAfterCreate.selectedSessionId);
  } finally {
    await harness.close();
  }

  const { SessionManager } = (await import(
    "../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"
  )) as {
    SessionManager: {
      open(path: string): {
        appendMessage(message: { role: "user"; content: string; timestamp: number }): string;
        _rewriteFile(): void;
      };
    };
  };
  const terminalSession = SessionManager.open(sessionFilePath);
  terminalSession.appendMessage({
    role: "user",
    content: "Message available after reopening pi-gui",
    timestamp: Date.now(),
  });
  terminalSession._rewriteFile();

  harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await expect
      .poll(async () => (await getSelectedTranscript(window))?.transcript.map((message) => message.text))
      .toContain("Message available after reopening pi-gui");
  } finally {
    await harness.close();
  }
});

async function sessionFilePathFor(userDataDir: string, workspaceId: string, sessionId: string): Promise<string> {
  const catalog = JSON.parse(await readFile(`${userDataDir}/catalogs.json`, "utf8")) as {
    readonly sessionFiles?: Record<string, string>;
  };
  const sessionFilePath = catalog.sessionFiles?.[`${workspaceId}:${sessionId}`];
  if (!sessionFilePath) {
    throw new Error(`Session file was unavailable for ${workspaceId}:${sessionId}`);
  }
  return sessionFilePath;
}
