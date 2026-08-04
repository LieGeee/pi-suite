import assert from "node:assert/strict";
import test from "node:test";

import type { DevelopmentModeConfig, DevelopmentWorkflowEdge, DevelopmentWorkflowNode } from "@pi-gui/pi-sdk-driver";
import { buildDevelopmentWorkflowGraph, buildDevelopmentWorkflowModel } from "./development-workflow-graph";

const config: DevelopmentModeConfig = {
  workflow: "proposal-review",
  environment: "worktree",
  mainAgent: { provider: "caease", modelId: "gpt-5.5", thinkingLevel: "medium" },
  documentContext: {
    enabled: true,
    paths: ["S:/note/xl-ht"],
    shareWithSubagents: true,
  },
  toolContext: {
    enabledExtensionPaths: ["C:/Users/leizh/AppData/Roaming/npm/node_modules/pi-hermes-memory/src/index.ts"],
  },
  subagents: [
    {
      id: "architect",
      name: "Architect",
      role: "architect",
      model: { provider: "deepseek", modelId: "deepseek-v4-pro" },
      permission: "read",
      trigger: "manual",
    },
    {
      id: "reviewer",
      name: "Reviewer",
      role: "reviewer",
      model: { provider: "deepseek", modelId: "deepseek-v4-pro" },
      permission: "read",
      trigger: "after-implementation",
    },
    {
      id: "tester-disabled",
      name: "Disabled Tester",
      role: "tester",
      enabled: false,
      model: { provider: "deepseek", modelId: "deepseek-v4-pro" },
      permission: "exec",
      trigger: "test-failure",
    },
  ],
};

test("builds a template orchestration graph from development mode config", () => {
  const graph = buildDevelopmentWorkflowGraph(config);

  assert.deepEqual(graph.nodes.map((node: DevelopmentWorkflowNode) => node.id), [
    "task",
    "worktree",
    "docs",
    "tools",
    "main",
    "subagent-architect",
    "subagent-reviewer",
    "summary",
  ]);
  assert.equal(graph.nodes.find((node: DevelopmentWorkflowNode) => node.id === "main")?.label, "主 Agent");
  assert.equal(graph.nodes.find((node: DevelopmentWorkflowNode) => node.id === "subagent-architect")?.role, "architect");
  assert.equal(graph.nodes.find((node: DevelopmentWorkflowNode) => node.id === "tools")?.description?.includes("pi-hermes-memory"), true);
  assert.equal(graph.nodes.some((node: DevelopmentWorkflowNode) => node.id === "subagent-tester-disabled"), false);
  assert.deepEqual(graph.edges.map((edge: DevelopmentWorkflowEdge) => `${edge.from}->${edge.to}:${edge.label ?? ""}`), [
    "task->worktree:创建沙箱",
    "worktree->docs:读取文档上下文",
    "docs->tools:启用工具扩展",
    "tools->main:交给主 Agent 编排",
    "main->subagent-architect:分派 architect",
    "main->subagent-reviewer:分派 reviewer",
    "subagent-architect->summary:提交结果",
    "subagent-reviewer->summary:提交结果",
  ]);
});

test("keeps disabled agents in an unused node pool", () => {
  const model = buildDevelopmentWorkflowModel(config);

  assert.equal(model.active.nodes.some((node: DevelopmentWorkflowNode) => node.id === "subagent-tester-disabled"), false);
  assert.deepEqual(model.unusedNodes.map((node: DevelopmentWorkflowNode) => node.id), ["subagent-tester-disabled"]);
  assert.equal(model.unusedNodes[0]?.label, "Disabled Tester");
  assert.equal(model.unusedNodes[0]?.role, "tester");
});
