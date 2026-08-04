import { basename } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  deferNextSendUserMessage,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  pasteTinyPng,
  resolveDeferredSendUserMessage,
  selectSession,
  waitForDeferredSendUserMessageStarted,
} from "../helpers/electron-app";

test("grouped existing-session submit does not block selecting another session", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("running-submit-category-switch");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    const workspaceName = basename(workspacePath);
    await createNamedThread(window, "任务A", { workspaceName });
    await createNamedThread(window, "任务B", { workspaceName });

    const rowA = window.locator(".session-row").filter({ hasText: "任务A" }).first();
    const rowB = window.locator(".session-row").filter({ hasText: "任务B" }).first();
    await rowA.click({ button: "right" });
    await window.getByRole("menuitem", { name: "多选此会话" }).click();
    await rowB.getByRole("checkbox", { name: "选择会话 任务B" }).check();
    await window.getByRole("button", { name: "合并为分类" }).click();
    await window.getByLabel("分类名称").fill("运行中任务");
    await window.getByRole("button", { name: "创建分类" }).click();
    const category = window.locator("[data-testid='session-category-node']").filter({ hasText: "运行中任务" }).first();
    await expect(category).toBeVisible();

    // Paste an image attachment on 任务B so we can verify it survives session A's submit
    await selectSession(window, "任务B");
    await pasteTinyPng(window);
    await expect(window.locator(".composer-attachment")).toBeVisible();

    await selectSession(window, "任务A");
    const stateBeforeSubmit = await getDesktopState(window);
    const targetSession = stateBeforeSubmit.workspaces
      .flatMap((workspace) => workspace.sessions)
      .find((session) => session.title === "任务B");
    expect(targetSession).toBeTruthy();

    await deferNextSendUserMessage(harness);
    const composer = window.getByTestId("composer");
    await composer.fill("让这个已有对话保持运行中");
    await composer.press("Enter");
    await waitForDeferredSendUserMessageStarted(harness);

    const groupedTargetRow = category.locator(".session-row").filter({ hasText: "任务B" }).first();
    await expect(groupedTargetRow).toBeVisible();
    await groupedTargetRow.click();

    await expect.poll(async () => (await getDesktopState(window)).selectedSessionId, { timeout: 1_500 })
      .toBe(targetSession!.id);
    await expect(window.locator(".chat-header__title")).toHaveText("任务B");

    // Regression: the attachment should still be visible after switching from a submitting session
    await expect(window.locator(".composer-attachment")).toBeVisible();
  } finally {
    await resolveDeferredSendUserMessage(harness).catch(() => undefined);
    await harness.close();
  }
});
