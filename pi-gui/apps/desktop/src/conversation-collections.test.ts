import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationGroup, WorkspaceRecord } from "./desktop-state";
// Node's strip-types runner requires an explicit TypeScript extension.
// @ts-ignore The renderer tsconfig intentionally disallows .ts import suffixes.
import { buildRecentConversations, pruneConversationGroups, sessionsForConversationGroup } from "./conversation-collections.ts";

function workspace(
  id: string,
  name: string,
  sessions: WorkspaceRecord["sessions"],
): WorkspaceRecord {
  return {
    id,
    name,
    path: `S:/${name}`,
    lastOpenedAt: "2026-07-16T10:00:00.000Z",
    kind: "primary",
    sessions,
  };
}

function group(id: string, sessions: ConversationGroup["sessions"]): ConversationGroup {
  return {
    id,
    name: id,
    sessions,
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
  };
}

test("最近对话跨项目汇总未归档会话并按活动时间排序", () => {
  const workspaces = [
    workspace("alpha", "甲项目", [
      {
        id: "older",
        title: "较早任务",
        updatedAt: "2026-07-16T09:00:00.000Z",
        preview: "old",
        status: "idle",
        hasUnseenUpdate: false,
      },
      {
        id: "archived",
        title: "已归档任务",
        updatedAt: "2026-07-16T12:00:00.000Z",
        archivedAt: "2026-07-16T12:01:00.000Z",
        preview: "archived",
        status: "idle",
        hasUnseenUpdate: false,
      },
    ]),
    workspace("beta", "乙项目", [
      {
        id: "newer",
        title: "最新任务",
        updatedAt: "2026-07-16T11:00:00.000Z",
        preview: "new",
        status: "idle",
        hasUnseenUpdate: false,
      },
    ]),
  ];

  assert.deepEqual(
    buildRecentConversations({ workspaces }).map((entry) => [entry.workspaceName, entry.session.title]),
    [
      ["乙项目", "最新任务"],
      ["甲项目", "较早任务"],
    ],
  );
});

test("加入一级分组后会话仍保留在最近对话", () => {
  const groups = [group("毕业设计", [{ workspaceId: "alpha", sessionId: "task" }])];
  const workspaces = [
    workspace("alpha", "甲项目", [
      {
        id: "task",
        title: "已分组任务",
        updatedAt: "2026-07-16T11:00:00.000Z",
        preview: "grouped",
        status: "idle",
        hasUnseenUpdate: false,
      },
    ]),
  ];

  assert.equal(buildRecentConversations({ workspaces }).some((entry) => entry.session.id === "task"), true);
  assert.deepEqual(
    sessionsForConversationGroup({ workspaces }, groups[0]!).map((entry) => entry.session.id),
    ["task"],
  );
});

test("清理分组中的失效引用与跨分组重复引用", () => {
  const workspaces = [
    workspace("alpha", "甲项目", [
      {
        id: "task",
        title: "任务",
        updatedAt: "2026-07-16T11:00:00.000Z",
        preview: "task",
        status: "idle",
        hasUnseenUpdate: false,
      },
    ]),
  ];
  const groups = [
    group("第一组", [
      { workspaceId: "alpha", sessionId: "task" },
      { workspaceId: "missing", sessionId: "gone" },
    ]),
    group("第二组", [{ workspaceId: "alpha", sessionId: "task" }]),
  ];

  assert.deepEqual(
    pruneConversationGroups(groups, workspaces).map((entry) => entry.sessions),
    [[{ workspaceId: "alpha", sessionId: "task" }], []],
  );
});
