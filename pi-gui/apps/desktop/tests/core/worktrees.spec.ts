import { expect, test } from "@playwright/test";
import {
  assertExists,
  createNamedThread,
  createSessionViaIpc,
  getDesktopState,
  launchDesktop,
  makeGitWorkspace,
  makeUserDataDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("creates and selects a worktree-backed workspace from the desktop UI", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("worktree-live-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForWorkspaceByPath(window, workspacePath);

    await window.getByRole("button", { name: `工作区操作：${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "创建永久工作树" }).click();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree" && (state.worktreesByWorkspace[rootWorkspace.id]?.length ?? 0) > 0;
      })
      .toBe(true);

    const stateAfterCreate = await getDesktopState(window);
    const worktreeWorkspace = stateAfterCreate.workspaces.find(
      (workspace) => workspace.id === stateAfterCreate.selectedWorkspaceId,
    );
    assertExists(worktreeWorkspace, "Expected the selected workspace to be the newly created worktree");
    if (worktreeWorkspace.kind !== "worktree") {
      throw new Error("Expected the selected workspace to be the newly created worktree");
    }

    await expect(window.locator(".environment-picker__button")).toContainText(worktreeWorkspace.name);
    await expect(window.locator(".empty-panel")).toContainText("为这个文件夹创建一个对话");
    await expect(window.locator(".empty-panel")).not.toContainText("/Users/");

    await window.getByRole("complementary").getByRole("button", { name: "新对话" }).click();
    await expect(window.getByTestId("new-thread-composer")).toBeVisible();
    await expect(window.getByRole("button", { name: "本地", exact: true })).toBeVisible();
    await expect(window.getByRole("button", { name: "工作树分支", exact: true })).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("shows a worktree icon in the sidebar without a local text badge", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("worktree-sidebar-indicator");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForWorkspaceByPath(window, workspacePath);

    await createNamedThread(window, "Local thread");
    const initialState = await getDesktopState(window);
    const localWorkspace = initialState.workspaces.find((workspace) => workspace.id === initialState.selectedWorkspaceId);
    const localSession = localWorkspace?.sessions.find((session) => session.title === "Local thread");
    assertExists(localSession, "Expected local thread session");

    await window.getByRole("button", { name: `工作区操作：${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "创建永久工作树" }).click();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree";
      })
      .toBe(true);

    const stateAfterCreate = await getDesktopState(window);
    const firstWorktree = stateAfterCreate.workspaces.find(
      (workspace) => workspace.id === stateAfterCreate.selectedWorkspaceId,
    );
    assertExists(firstWorktree, "Expected selected worktree workspace");

    await createSessionViaIpc(window, firstWorktree.id, "Worktree thread");
    const latestState = await getDesktopState(window);
    const selectedWorktreeWorkspace = latestState.workspaces.find((workspace) => workspace.id === latestState.selectedWorkspaceId);
    const worktreeSession = selectedWorktreeWorkspace?.sessions.find((session) => session.title === "Worktree thread");
    assertExists(worktreeSession, "Expected worktree thread session");
    expect(selectedWorktreeWorkspace?.kind).toBe("worktree");
    await expect(window.locator(".session-row__workspace-icon")).toHaveCount(1);
    await expect(window.getByTestId("workspace-list")).not.toContainText("Local project");
  } finally {
    await harness.close();
  }
});

test("keeps orphaned worktree workspaces visible after removing the root workspace", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("worktree-orphan-visibility");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const rootWorkspace = await waitForWorkspaceByPath(window, workspacePath);

    await window.getByRole("button", { name: `工作区操作：${rootWorkspace.name}` }).click();
    await window.getByRole("button", { name: "创建永久工作树" }).click();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const selected = state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
        return selected?.kind === "worktree";
      })
      .toBe(true);

    const createdState = await getDesktopState(window);
    const createdWorkspace = createdState.workspaces.find((workspace) => workspace.id === createdState.selectedWorkspaceId);
    assertExists(createdWorkspace, "Expected created worktree workspace");

    await window.getByRole("button", { name: `工作区操作：${rootWorkspace.name}` }).click();
    window.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await window.getByRole("button", { name: "移除" }).click();

    await expect(window.getByTestId("empty-state")).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        return state.workspaces.some((workspace) => workspace.id === createdWorkspace.id);
      })
      .toBe(true);
  } finally {
    await harness.close();
  }
});
