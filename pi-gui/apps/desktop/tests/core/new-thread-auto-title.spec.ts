import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createNamedThread,
  getDesktopState,
  launchDesktop,
  makeGitWorkspace,
  makeUserDataDir,
  makeWorkspace,
  resolveDeferredThreadTitle,
  resolveDeferredThreadTitleEventually,
  selectSession,
  setDeferredThreadTitleMode,
  startThreadViaIpc,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("auto-titles a brand-new local thread after showing the placeholder first", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("auto-title-local-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      prompt: "Refactor the session title flow and keep sidebar state in sync",
    });

    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await expectSelectedSessionTitle(window, "新对话");

    await resolveDeferredThreadTitleEventually(harness, "Refactor title flow");

    await expectSelectedSessionTitle(window, "Refactor title flow");
    await expectSessionTitleInState(window, "Refactor title flow");
    await expectNoSessionTitleInState(window, "新对话");
  } finally {
    await harness.close();
  }
});

test("auto-titles a brand-new worktree thread after showing the placeholder first", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeGitWorkspace("auto-title-worktree-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForWorkspaceByPath(window, workspacePath);
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      environment: "worktree",
      workspaceName: rootWorkspace.name,
      prompt: "Fix the worktree rename race before shipping",
    });

    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await expectSelectedSessionTitle(window, "新对话");

    await resolveDeferredThreadTitleEventually(harness, "Fix worktree rename");

    await expectSelectedSessionTitle(window, "Fix worktree rename");
    await expectSessionTitleInState(window, "Fix worktree rename");
  } finally {
    await harness.close();
  }
});

test("switching away does not cancel a pending auto-title", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("auto-title-navigation-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspace = await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Existing thread");
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      prompt: "Keep auto title alive after switching views",
    });

    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await selectSession(window, "Existing thread");
    await expect.poll(async () => (await getDesktopState(window)).selectedWorkspaceId).toBe(workspace.id);

    await resolveDeferredThreadTitleEventually(harness, "Keep title after nav");
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return state.workspaces.some((candidateWorkspace) =>
          candidateWorkspace.sessions.some((session) => session.title === "Keep title after nav"),
        );
      })
      .toBe(true);

    const autoTitledRow = window.locator(".session-row__select", { hasText: "Keep title after nav" }).first();
    await expect(autoTitledRow).toBeVisible({ timeout: 15_000 });
    await autoTitledRow.click();
    await expect(window.locator(".topbar__session")).toHaveText("Keep title after nav");
  } finally {
    await harness.close();
  }
});

test("manual rename beats a delayed auto-title result", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("auto-title-manual-rename-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      prompt: "Build a deferred thread title test seam",
    });

    const composer = window.getByTestId("composer");
    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await expectSelectedSessionTitle(window, "新对话");
    await waitForComposerReadyForNextSubmit(window);

    await composer.fill("/name Manual title wins");
    await composer.press("Enter");

    await expectSelectedSessionTitle(window, "Manual title wins");
    await expectSessionTitleInState(window, "Manual title wins");

    await resolveDeferredThreadTitleEventually(harness, "Ignored generated title");

    await expectSelectedSessionTitle(window, "Manual title wins");
    await expectSessionTitleInState(window, "Manual title wins");
    await expectNoSessionTitleInState(window, "Ignored generated title");
  } finally {
    await harness.close();
  }
});

test("later sends do not retrigger auto-title generation", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("auto-title-no-retrigger-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      prompt: "Track a one-shot title request token",
    });

    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await expectSelectedSessionTitle(window, "新对话");
    await resolveDeferredThreadTitleEventually(harness, "Track title token");
    await expectSelectedSessionTitle(window, "Track title token");
    await expectSessionTitleInState(window, "Track title token");
    await waitForComposerReadyForNextSubmit(window);

    const composer = window.getByTestId("composer");
    await composer.fill("/status");
    await composer.press("Enter");

    await expectSelectedSessionTitle(window, "Track title token");
    await expectSessionTitleInState(window, "Track title token");
    await expect(resolveDeferredThreadTitle(harness, "Should not apply")).rejects.toThrow(/unavailable/);
  } finally {
    await harness.close();
  }
});

test("reopen heals a stale placeholder catalog title after auto-title finished", async () => {
  const userDataDir = await makeUserDataDir("pi-app-user-data-");
  const workspacePath = await makeWorkspace("auto-title-reopen-heal-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  let workspaceId = "";
  let sessionId = "";
  const generatedTitle = "Heal title after reopen";

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await setDeferredThreadTitleMode(harness);

    await startThreadViaIpc(window, {
      prompt: "Verify the app heals stale placeholder titles on reopen",
    });

    await expect(window.locator(".topbar__session")).toHaveText("新对话");
    await expectSelectedSessionTitle(window, "新对话");
    await resolveDeferredThreadTitleEventually(harness, generatedTitle);
    await expectSessionTitleInState(window, generatedTitle);

    const state = await getDesktopState(window);
    const generatedSession = state.workspaces
      .flatMap((workspace) => workspace.sessions)
      .find((session) => session.title === generatedTitle);
    expect(generatedSession).toBeTruthy();
    workspaceId = generatedSession?.workspaceId ?? "";
    sessionId = generatedSession?.id ?? "";
  } finally {
    await harness.close();
  }

  const catalogsPath = join(userDataDir, "catalogs.json");
  const catalogs = JSON.parse(await readFile(catalogsPath, "utf8")) as {
    sessions: Array<{
      sessionRef: { workspaceId: string; sessionId: string };
      title: string;
    }>;
  };
  catalogs.sessions = catalogs.sessions.map((session) =>
    session.sessionRef.workspaceId === workspaceId && session.sessionRef.sessionId === sessionId
      ? { ...session, title: "新对话" }
      : session,
  );
  await writeFile(catalogsPath, `${JSON.stringify(catalogs, null, 2)}\n`, "utf8");

  const secondRun = await launchDesktop(userDataDir, { testMode: "background" });
  try {
    const window = await secondRun.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await expectSelectedSessionTitle(window, generatedTitle);
    await expectSessionTitleInState(window, generatedTitle);
    await expectNoSessionTitleInState(window, "新对话");
  } finally {
    await secondRun.close();
  }
});

async function expectSelectedSessionTitle(window: Page, title: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = await getDesktopState(window);
      const workspace = state.workspaces.find((entry) => entry.id === state.selectedWorkspaceId);
      const session = workspace?.sessions.find((entry) => entry.id === state.selectedSessionId);
      return session?.title ?? "";
    }, { timeout: 15_000 })
    .toBe(title);
  await expect(window.locator(".topbar__session")).toHaveText(title, { timeout: 15_000 });
}

async function expectSessionTitleInState(window: Page, title: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = await getDesktopState(window);
      return state.workspaces.some((workspace) =>
        workspace.sessions.some((session) => session.title === title),
      );
    }, { timeout: 15_000 })
    .toBe(true);
}

async function expectNoSessionTitleInState(window: Page, title: string): Promise<void> {
  await expect
    .poll(async () => {
      const state = await getDesktopState(window);
      return state.workspaces.some((workspace) =>
        workspace.sessions.some((session) => session.title === title),
      );
    }, { timeout: 15_000 })
    .toBe(false);
}

async function waitForComposerReadyForNextSubmit(window: Page): Promise<void> {
  const sendButton = window.getByRole("button", { name: "发送消息" });
  if (await sendButton.isVisible().catch(() => false)) {
    return;
  }

  const stopButton = window.getByRole("button", { name: "停止运行" });
  await expect
    .poll(async () => {
      if (await sendButton.isVisible().catch(() => false)) {
        return "send";
      }
      if (await stopButton.isVisible().catch(() => false)) {
        return "stop";
      }
      return "pending";
    }, { timeout: 15_000 })
    .not.toBe("pending");
  if (await sendButton.isVisible().catch(() => false)) {
    return;
  }
  try {
    await stopButton.click({ timeout: 5_000 });
  } catch (error) {
    if (!(await sendButton.isVisible().catch(() => false))) {
      throw error;
    }
  }
  await expect(sendButton).toBeVisible({ timeout: 15_000 });
}
