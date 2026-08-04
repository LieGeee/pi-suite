import assert from "node:assert/strict";
import test from "node:test";

import type { DevelopmentModePreset } from "../src/desktop-state";
import { buildDevelopmentModePrompt, buildDevelopmentSubagentPrompt } from "./development-mode-prompt";

const preset: DevelopmentModePreset = {
  id: "preset-dev",
  name: "Council",
  config: {
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
    graph: {
      nodes: [
        { id: "task", kind: "input", label: "用户需求" },
        { id: "architect", kind: "agent", label: "Architect", role: "architect", model: { provider: "deepseek", modelId: "deepseek-v4-pro" }, permission: "read" },
        { id: "summary", kind: "summary", label: "主 Agent 汇总" },
      ],
      edges: [
        { from: "task", to: "architect", label: "分析方案" },
        { from: "architect", to: "summary", label: "提交结论" },
      ],
    },
    subagents: [
      {
        id: "reviewer",
        name: "Reviewer",
        role: "reviewer",
        model: { provider: "deepseek", modelId: "deepseek-v4-pro", thinkingLevel: "medium" },
        permission: "read",
        trigger: "after-implementation",
      },
      {
        id: "tester-disabled",
        name: "Disabled Tester",
        role: "tester",
        enabled: false,
        model: { provider: "deepseek", modelId: "deepseek-v4-pro", thinkingLevel: "medium" },
        permission: "exec",
        trigger: "test-failure",
      },
    ],
  },
};

test("wraps a user request with development workflow, roles, and document context", () => {
  const prompt = buildDevelopmentModePrompt("实现订单审批", preset);

  assert.match(prompt, /开发模式：Council/);
  assert.match(prompt, /方案评审/);
  assert.match(prompt, /运行环境：worktree/);
  assert.match(prompt, /caease:gpt-5.5/);
  assert.match(prompt, /Reviewer/);
  assert.match(prompt, /reviewer/);
  assert.doesNotMatch(prompt, /Disabled Tester/);
  assert.match(prompt, /S:\/note\/xl-ht/);
  assert.match(prompt, /pi-hermes-memory/);
  assert.match(prompt, /编排图：/);
  assert.match(prompt, /用户需求 -> Architect（分析方案）/);
  assert.match(prompt, /Architect -> 主 Agent 汇总（提交结论）/);
  assert.match(prompt, /实现订单审批/);
});

test("builds a role-specific subagent prompt", () => {
  const reviewer = preset.config.subagents[0];
  assert.ok(reviewer);
  const prompt = buildDevelopmentSubagentPrompt("实现订单审批", preset, reviewer);

  assert.match(prompt, /你是开发模式中的子 Agent/);
  assert.match(prompt, /角色：reviewer/);
  assert.match(prompt, /权限：read/);
  assert.match(prompt, /deepseek:deepseek-v4-pro/);
  assert.match(prompt, /S:\/note\/xl-ht/);
  assert.match(prompt, /pi-hermes-memory/);
  assert.match(prompt, /只输出你的分析、建议、风险和验证要点/);
  assert.match(prompt, /实现订单审批/);
});

test("returns original text when preset has no development config", () => {
  const minimalPreset: DevelopmentModePreset = {
    id: "empty",
    name: "Empty",
    config: {
      mainAgent: { provider: "", modelId: "" },
      subagents: [],
    },
  };

  assert.equal(buildDevelopmentModePrompt("普通任务", minimalPreset), "普通任务");
});
