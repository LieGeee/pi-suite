import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
// @ts-ignore Node's strip-types runner requires an explicit TypeScript extension.
import { readPersistedUiState, writePersistedUiState } from "./app-store-persistence.ts";

const groups = [{
  id: "graduation",
  name: "毕业设计",
  sessions: [{ workspaceId: "alpha", sessionId: "task" }],
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:00:00.000Z",
}] as const;

test("v13 UI 状态读写侧栏页签、外观主题和跨项目一级分组", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-ui-state-theme-groups-"));
  const statePath = join(root, "ui-state.json");

  await writePersistedUiState(statePath, {
    activeView: "threads",
    sidebarTab: "projects",
    appearanceTheme: "pure-white",
    conversationGroups: groups,
    sessionCategoriesByWorkspace: {
      alpha: {
        version: 1,
        categories: [{ id: "legacy", name: "原项目分类", sessionRefs: [], children: [] }],
      },
    },
  });

  const serialized = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
  assert.equal(serialized.version, 13);
  assert.equal(serialized.sidebarTab, "projects");
  assert.equal(serialized.appearanceTheme, "pure-white");
  assert.deepEqual(serialized.conversationGroups, groups);

  const restored = await readPersistedUiState(statePath);
  assert.equal(restored.sidebarTab, "projects");
  assert.equal(restored.appearanceTheme, "pure-white");
  assert.deepEqual(restored.conversationGroups, groups);
  assert.equal(restored.sessionCategoriesByWorkspace?.alpha?.categories[0]?.name, "原项目分类");
});

test("读取时清理无效分组字段但保留合法记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-gui-ui-state-invalid-groups-"));
  const statePath = join(root, "ui-state.json");
  await writeFile(statePath, JSON.stringify({
    version: 13,
    sidebarTab: "unknown",
    appearanceTheme: "bad id!",
    conversationGroups: [
      {
        ...groups[0],
        sessions: [
          ...groups[0].sessions,
          { workspaceId: 1, sessionId: "bad" },
        ],
      },
      { id: "", name: "无效", sessions: [] },
      { id: "second", name: "", sessions: [] },
    ],
  }));

  const restored = await readPersistedUiState(statePath);
  assert.equal(restored.sidebarTab, undefined);
  assert.equal(restored.appearanceTheme, undefined);
  assert.deepEqual(restored.conversationGroups, groups);
});
