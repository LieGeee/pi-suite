import type { DevelopmentModeConfig, DevelopmentWorkflowEdge, DevelopmentWorkflowGraph, DevelopmentWorkflowNode } from "@pi-gui/pi-sdk-driver";

function displayPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const nodeModulesIndex = parts.lastIndexOf("node_modules");
  const packageName = parts[nodeModulesIndex + 1];
  if (nodeModulesIndex >= 0 && packageName) {
    if (packageName.startsWith("@") && parts[nodeModulesIndex + 2]) {
      return `${packageName}/${parts[nodeModulesIndex + 2]}`;
    }
    return packageName;
  }
  return parts[parts.length - 1] ?? path;
}

function contextDescription(paths: readonly string[], prefix: string): string {
  return paths.length > 0 ? `${prefix}: ${paths.map(displayPath).join(", ")}` : prefix;
}

export interface DevelopmentWorkflowModel {
  readonly active: DevelopmentWorkflowGraph;
  readonly unusedNodes: readonly DevelopmentWorkflowNode[];
}

export function buildDevelopmentWorkflowModel(config: DevelopmentModeConfig): DevelopmentWorkflowModel {
  return {
    active: buildDevelopmentWorkflowGraph(config),
    unusedNodes: config.subagents
      .filter((agent) => agent.enabled === false)
      .map((agent) => subagentToNode(agent)),
  };
}

export function buildDevelopmentWorkflowGraph(config: DevelopmentModeConfig): DevelopmentWorkflowGraph {
  const nodes: DevelopmentWorkflowNode[] = [
    { id: "task", kind: "input", label: "用户需求" },
  ];
  const edges: DevelopmentWorkflowEdge[] = [];
  let previousContextNodeId = "task";

  if ((config.environment ?? "local") === "worktree") {
    nodes.push({
      id: "worktree",
      kind: "worktree",
      label: "工作树沙箱",
      description: "在隔离工作区中执行开发任务",
    });
    edges.push({ from: previousContextNodeId, to: "worktree", label: "创建沙箱" });
    previousContextNodeId = "worktree";
  }

  if (config.documentContext?.enabled && config.documentContext.paths.length > 0) {
    nodes.push({
      id: "docs",
      kind: "docs",
      label: "项目文档",
      description: contextDescription(config.documentContext.paths, "参考文档"),
    });
    edges.push({ from: previousContextNodeId, to: "docs", label: "读取文档上下文" });
    previousContextNodeId = "docs";
  }

  if (config.toolContext?.enabled !== false && (config.toolContext?.enabledExtensionPaths.length ?? 0) > 0) {
    nodes.push({
      id: "tools",
      kind: "tools",
      label: "工具扩展",
      description: contextDescription(config.toolContext?.enabledExtensionPaths ?? [], "启用工具"),
    });
    edges.push({ from: previousContextNodeId, to: "tools", label: "启用工具扩展" });
    previousContextNodeId = "tools";
  }

  nodes.push({
    id: "main",
    kind: "agent",
    label: "主 Agent",
    model: config.mainAgent,
    description: workflowDescription(config.workflow),
  });
  edges.push({ from: previousContextNodeId, to: "main", label: "交给主 Agent 编排" });

  const activeSubagents = config.subagents.filter((agent) => agent.enabled !== false);
  const subagentNodeIds: string[] = [];
  for (const agent of activeSubagents) {
    const id = `subagent-${agent.id}`;
    subagentNodeIds.push(id);
    nodes.push(subagentToNode(agent));
    edges.push({ from: "main", to: id, label: `分派 ${agent.role ?? agent.permission}` });
  }

  nodes.push({
    id: "summary",
    kind: "summary",
    label: "主 Agent 汇总",
    model: config.mainAgent,
  });

  for (const id of subagentNodeIds) {
    edges.push({ from: id, to: "summary", label: "提交结果" });
  }
  if (subagentNodeIds.length === 0) {
    edges.push({ from: "main", to: "summary", label: "形成结论" });
  }

  return { nodes, edges };
}

function subagentToNode(agent: DevelopmentModeConfig["subagents"][number]): DevelopmentWorkflowNode {
  return {
    id: `subagent-${agent.id}`,
    kind: "agent",
    label: agent.name || agent.id,
    ...(agent.role ? { role: agent.role } : {}),
    model: agent.model,
    permission: agent.permission,
    description: triggerDescription(agent.trigger),
  };
}

function workflowDescription(workflow: DevelopmentModeConfig["workflow"]): string {
  switch (workflow) {
    case "parallel-development":
      return "拆分并行任务并汇总";
    case "proposal-review":
      return "产出方案并组织评审";
    case "code-review":
      return "组织实现审查和风险检查";
    case "test-fix":
      return "复现、修复并验证测试";
    case "manual":
    default:
      return "手动编排";
  }
}

function triggerDescription(trigger: string): string {
  switch (trigger) {
    case "after-implementation":
      return "实现后触发";
    case "test-failure":
      return "测试失败时触发";
    case "manual":
    default:
      return "手动触发";
  }
}
