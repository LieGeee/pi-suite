import { expect, test, type Locator, type Page } from "@playwright/test";
import { join } from "node:path";
import {
  desktopShortcut,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedBranchedTreeSessionFixture,
  seedToolResultTreeSessionFixture,
  selectSession,
} from "../helpers/electron-app";

test("opens /tree from the composer, navigates branches, and blocks it on the new-thread surface", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("tree-command-workspace");
  await seedAgentDir(agentDir);
  await seedBranchedTreeSessionFixture(agentDir, workspacePath);

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await selectSession(window, "Tree fixture session");

    const composer = window.getByTestId("composer");
    await runTreeCommand(window, composer, "/tre");

    const treeModal = window.getByTestId("tree-modal");
    await expect(treeModal).toBeVisible();
    await expect(window.getByTestId("tree-modal-search")).toBeFocused();
    await expect(treeModal).not.toContainText("Tree fixture session");
    await expect(treeModal).not.toContainText("gpt-5.4");
    await expect(treeModal).not.toContainText("Thinking");
    await expect
      .poll(
        async () =>
          window.getByTestId("tree-modal-list").evaluate((list) =>
            list instanceof HTMLElement ? list.scrollTop : -1,
          ),
        { timeout: 1_500 },
      )
      .toBeGreaterThan(0);
    const initialScrollState = await window.getByTestId("tree-modal-list").evaluate((list) => {
      if (!(list instanceof HTMLElement)) {
        throw new Error("Expected tree list in modal");
      }
      return {
        scrollTop: list.scrollTop,
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
      };
    });
    expect(initialScrollState.scrollTop).toBeGreaterThan(0);
    expect(initialScrollState.scrollTop + initialScrollState.clientHeight).toBeGreaterThan(
      initialScrollState.scrollHeight - 40,
    );

    await treeModal.locator(".tree-row__content", { hasText: "Branch alpha" }).click();
    await treeModal.getByRole("button", { name: "继续" }).click();
    await expect(window.getByTestId("tree-summary-step")).toBeVisible();
    await treeModal.getByRole("button", { name: "不生成摘要" }).click();
    await treeModal.getByRole("button", { name: "切换分支" }).click();

    await expect(treeModal).toHaveCount(0);
    await expect(composer).toHaveValue("Branch alpha");
    await expect
      .poll(async () => {
        const record = await getSelectedTranscript(window);
        if (!record) return "";
        return record.transcript
          .map((m) => (m.kind === "message" ? m.text : "label" in m ? m.label ?? "" : ""))
          .join("\n");
      }, { timeout: 10_000 })
      .toContain("Root answer");
    await expect
      .poll(async () => {
        const record = await getSelectedTranscript(window);
        if (!record) return "";
        return record.transcript
          .map((m) => (m.kind === "message" ? m.text : "label" in m ? m.label ?? "" : ""))
          .join("\n");
      }, { timeout: 10_000 })
      .not.toContain("Branch beta");
    await expect
      .poll(async () => {
        const record = await getSelectedTranscript(window);
        if (!record) return "";
        return record.transcript
          .map((m) => (m.kind === "message" ? m.text : "label" in m ? m.label ?? "" : ""))
          .join("\n");
      }, { timeout: 10_000 })
      .not.toContain("Beta answer");
    await expect(window.getByTestId("transcript")).toContainText("Root answer");
    await expect(window.getByTestId("transcript")).not.toContainText("Branch beta");

    await runTreeCommand(window, composer, "/tree");
    await expect(treeModal).toBeVisible();
    await treeModal.locator(".tree-row__content", { hasText: "Beta answer" }).click();
    await treeModal.getByRole("button", { name: "继续" }).click();
    await treeModal.getByRole("button", { name: "不生成摘要" }).click();
    await treeModal.getByRole("button", { name: "切换分支" }).click();

    await expect(treeModal).toHaveCount(0);
    await expect(composer).toHaveValue("");
    await expect
      .poll(async () => {
        const record = await getSelectedTranscript(window);
        if (!record) return "";
        return record.transcript
          .map((m) => (m.kind === "message" ? m.text : "label" in m ? m.label ?? "" : ""))
          .join("\n");
      }, { timeout: 10_000 })
      .toContain("Branch beta");
    await expect
      .poll(async () => {
        const record = await getSelectedTranscript(window);
        if (!record) return "";
        return record.transcript
          .map((m) => (m.kind === "message" ? m.text : "label" in m ? m.label ?? "" : ""))
          .join("\n");
      }, { timeout: 10_000 })
      .toContain("Beta answer");
    await expect(window.getByTestId("transcript")).toContainText("Branch beta");
    await expect(window.getByTestId("transcript")).toContainText("Beta answer");

    await window.keyboard.press(desktopShortcut("Shift+O"));
    const newThreadComposer = window.getByTestId("new-thread-composer");
    await expect(newThreadComposer).toBeVisible();
    await newThreadComposer.fill("/tree ");
    await newThreadComposer.press("Enter");
    await expect(window.getByTestId("composer-error-banner")).toContainText(
      "/tree 只能在已有会话中使用。",
    );
    await expect(newThreadComposer).toHaveValue("/tree ");
  } finally {
    await harness.close();
  }
});

test("renders tool results with compact previews in the tree modal", async () => {
  test.setTimeout(90_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("tree-tool-command-workspace");
  await seedAgentDir(agentDir);
  await seedToolResultTreeSessionFixture(agentDir, workspacePath);

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await selectSession(window, "Tree tool fixture session");

    const composer = window.getByTestId("composer");
    await runTreeCommand(window, composer, "/tree");

    const treeModal = window.getByTestId("tree-modal");
    await expect(treeModal).toBeVisible();
    await expect(treeModal).toContainText("[read:");
    await expect(treeModal).toContainText("assistant: README inspected.");
    await expect(treeModal.getByRole("button", { name: "无工具" })).toHaveCount(0);
  } finally {
    await harness.close();
  }
});

async function runTreeCommand(window: Page, composer: Locator, value: string): Promise<void> {
  await composer.fill(value);
  const slashMenu = window.getByTestId("slash-menu");
  await expect(slashMenu).toContainText("会话树");
  await slashMenu.locator(".slash-menu__item", { hasText: "/tree" }).first().click();
}
