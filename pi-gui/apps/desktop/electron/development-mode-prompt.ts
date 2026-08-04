import type { DevelopmentModePreset } from "../src/desktop-state";
import type { DevelopmentModeConfig, DevelopmentSubagentConfig } from "@pi-gui/pi-sdk-driver";
import { buildDevelopmentWorkflowGraph } from "../src/development-workflow-graph";

export function buildDevelopmentModePrompt(
  userText: string,
  preset: DevelopmentModePreset | undefined,
  options: { readonly realSubagentsWillRun?: boolean } = {},
): string {
  if (!preset || !hasDevelopmentModeConfig(preset.config)) {
    return userText;
  }

  const realSubagentsWillRun = options.realSubagentsWillRun ?? false;
  const workflow = workflowLabel(preset.config.workflow);
  const mainAgent = preset.config.mainAgent;
  const subagents = (preset.config.subagents ?? []).filter((agent) => agent.enabled !== false);
  const docContext = preset.config.documentContext;
  const toolContext = preset.config.toolContext;
  const graph = preset.config.graph ?? buildDevelopmentWorkflowGraph(preset.config);
  const parts = [
    realSubagentsWillRun
      ? "你正在 Pi GUI 的开发模式中工作。系统会真实并行启动子 Agent。你是主 Agent/协调者，不要假装自己是子 Agent，不要模拟 [Architect]/[Developer]/[Reviewer] 等子 Agent 输出；请只用 [Main] 或 [Summary] 输出你的主 Agent 判断、分派、整合策略和必要结论。不要把这些配置当作用户原始需求的一部分。"
      : "你正在 Pi GUI 的开发模式中工作。请在同一个回答中完成整个编排流程，用 [角色名] 标签分角色输出。不要把这些配置当作用户原始需求的一部分。",
    "",
    `开发模式：${preset.name}`,
    `工作流：${workflow}`,
    `运行环境：${preset.config.environment ?? "local"}`,
    `子 Agent 启动策略：${launchPolicyLabel(preset.config.subagentLaunchPolicy)}`,
    `主 Agent：${mainAgent.provider}:${mainAgent.modelId}${mainAgent.thinkingLevel ? `（thinking=${mainAgent.thinkingLevel}）` : ""}`,
    "",
    subagents.length > 0
      ? [
          "子 Agent 角色：",
          ...subagents.map(formatSubagentLine),
        ].join("\n")
      : "子 Agent 角色：未配置。",
    "",
    docContext?.enabled && docContext.paths.length > 0
      ? [
          "项目文档上下文：",
          ...docContext.paths.map((entry) => `- ${entry}`),
          `共享给子 Agent：${docContext.shareWithSubagents === false ? "否" : "是"}`,
          "请优先参考这些路径下的业务文档、接口说明和项目约定；如果无法直接读取，请先说明需要用户提供或让有权限的 Agent 读取。",
        ].join("\n")
      : "项目文档上下文：未配置。",
    "",
    toolContext?.enabled !== false && toolContext?.enabledExtensionPaths.length
      ? [
          "可用工具扩展：",
          ...toolContext.enabledExtensionPaths.map((entry) => `- ${entry}`),
          "需要记忆、搜索、会话检索或外部工具时，优先使用上述已启用扩展提供的工具。",
        ].join("\n")
      : "可用工具扩展：未特别指定，按当前会话工具能力执行。",
    "",
    graph && graph.nodes.length > 0
      ? formatWorkflowGraph(graph)
      : "编排图：未配置，按工作流模板和子 Agent 角色执行。",
    "",
    workflowInstruction(preset.config.workflow, realSubagentsWillRun),
    "",
    "用户原始需求：",
    userText,
  ];

  return parts.join("\n");
}

export function buildDevelopmentSubagentPrompt(
  userText: string,
  preset: DevelopmentModePreset,
  agent: DevelopmentSubagentConfig,
): string {
  const docContext = preset.config.documentContext;
  const toolContext = preset.config.toolContext;
  const graph = preset.config.graph ?? buildDevelopmentWorkflowGraph(preset.config);
  return [
    "你是开发模式中的子 Agent。请只按你的角色和权限完成分派部分，不要假装自己是主 Agent。",
    "",
    `开发模式：${preset.name}`,
    `工作流：${workflowLabel(preset.config.workflow)}`,
    `运行环境：${preset.config.environment ?? "local"}`,
    `子 Agent：${agent.name || agent.id}`,
    `角色：${agent.role ?? roleFromPermission(agent.permission)}`,
    `模型：${agent.model.provider}:${agent.model.modelId}${agent.model.thinkingLevel ? `（thinking=${agent.model.thinkingLevel}）` : ""}`,
    `权限：${agent.permission}`,
    `触发：${triggerLabel(agent.trigger)}`,
    "",
    docContext?.enabled && docContext.paths.length > 0
      ? [
          "项目文档上下文：",
          ...docContext.paths.map((entry) => `- ${entry}`),
        ].join("\n")
      : "项目文档上下文：未配置。",
    "",
    toolContext?.enabled !== false && toolContext?.enabledExtensionPaths.length
      ? [
          "可用工具扩展：",
          ...toolContext.enabledExtensionPaths.map((entry) => `- ${entry}`),
        ].join("\n")
      : "可用工具扩展：未特别指定。",
    "",
    graph.nodes.length > 0 ? formatWorkflowGraph(graph) : "编排图：未配置。",
    "",
    "输出要求：只输出你的分析、建议、风险和验证要点；如果权限不是 write，不要直接修改代码；如果需要主 Agent 执行下一步，请明确说明。",
    "",
    "用户原始需求：",
    userText,
  ].join("\n");
}

function hasDevelopmentModeConfig(config: DevelopmentModeConfig): boolean {
  return Boolean(
    config.workflow ||
      config.environment === "worktree" ||
      (config.documentContext?.enabled && config.documentContext.paths.length > 0) ||
      (config.toolContext?.enabled !== false && (config.toolContext?.enabledExtensionPaths.length ?? 0) > 0) ||
      (config.graph?.nodes.length ?? 0) > 0 ||
      config.subagents.some((agent) => agent.enabled !== false),
  );
}

function formatWorkflowGraph(graph: NonNullable<DevelopmentModeConfig["graph"]>): string {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeLines = graph.edges.map((edge) => {
    const from = nodesById.get(edge.from)?.label ?? edge.from;
    const to = nodesById.get(edge.to)?.label ?? edge.to;
    return `- ${from} -> ${to}${edge.label ? `（${edge.label}）` : ""}`;
  });
  const nodeLines = graph.nodes.map((node) => {
    const details = [
      node.role ? `role=${node.role}` : undefined,
      node.model ? `model=${node.model.provider}:${node.model.modelId}` : undefined,
      node.permission ? `permission=${node.permission}` : undefined,
      node.description,
    ].filter(Boolean);
    return `- ${node.label} [${node.kind}]${details.length > 0 ? `：${details.join("，")}` : ""}`;
  });
  return [
    "编排图：",
    "节点：",
    ...nodeLines,
    "连线：",
    ...(edgeLines.length > 0 ? edgeLines : ["- 未配置连线"]),
  ].join("\n");
}

function formatSubagentLine(agent: DevelopmentSubagentConfig): string {
  const role = agent.role ?? roleFromPermission(agent.permission);
  const trigger = triggerLabel(agent.trigger);
  return `- ${agent.name || agent.id}：role=${role}，model=${agent.model.provider}:${agent.model.modelId}，permission=${agent.permission}，trigger=${trigger}`;
}

function roleFromPermission(permission: DevelopmentSubagentConfig["permission"]): string {
  switch (permission) {
    case "write":
      return "developer";
    case "exec":
      return "tester";
    case "read":
      return "reviewer";
  }
}

function workflowLabel(workflow: DevelopmentModeConfig["workflow"]): string {
  switch (workflow) {
    case "parallel-development":
      return "并行开发";
    case "proposal-review":
      return "方案评审";
    case "code-review":
      return "代码审查";
    case "test-fix":
      return "测试修复";
    case "manual":
    default:
      return "手动编排";
  }
}

function launchPolicyLabel(policy: DevelopmentModeConfig["subagentLaunchPolicy"]): string {
  switch (policy) {
    case "manual":
      return "手动启动";
    case "every-message":
      return "每轮自动";
    case "first-message":
    default:
      return "首轮自动";
  }
}

function triggerLabel(trigger: DevelopmentSubagentConfig["trigger"]): string {
  switch (trigger) {
    case "after-implementation":
      return "实现后";
    case "test-failure":
      return "测试失败时";
    case "manual":
    default:
      return "手动";
  }
}

function workflowInstruction(workflow: DevelopmentModeConfig["workflow"], realSubagentsWillRun = false): string {
  if (realSubagentsWillRun) {
    return "执行要求：真实子 Agent 会由系统并行启动并在稍后回填到当前对话。你作为主 Agent 不要重复扮演这些角色；请聚焦任务拆解、关键约束、集成判断和最终协调。如果子 Agent 结果尚未出现，请先给出 [Main] 初步判断，不要编造子 Agent 结论。";
  }

  switch (workflow) {
    case "parallel-development":
      return "执行要求：请在同一个回答中拆分为多个角色发言，使用 [Architect]、[Developer]、[Reviewer] 等标签区分不同角色的分析/实现/审查内容。最后用 [Summary] 给出主 Agent 汇总结论。不需启动额外会话窗口。";
    case "proposal-review":
      return "执行要求：先给出 2-3 个方案，再在同一个回答中用 [Reviewer] 等角色标签分角色进行优缺点评审。最后用 [Summary] 汇总推荐方案。不需启动额外会话窗口。";
    case "code-review":
      return "执行要求：请在同一个回答中完成实现审查。用 [Reviewer] 标签检查风险、边界条件、测试缺口，最后列出必须修复和可选优化。不需启动额外会话窗口。";
    case "test-fix":
      return "执行要求：请在同一个回答中用 [Tester]、[Fixer]、[Reviewer] 等标签分角色组织复现、修复和验证。避免未验证就宣称完成。不需启动额外会话窗口。";
    case "manual":
    default:
      return "执行要求：请在同一个回答中按角色标签（[Architect]、[Developer]、[Reviewer] 等）组织各部分输出。最后 [Summary] 给出主 Agent 结论。不需启动额外会话窗口。";
  }
}
