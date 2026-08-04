import * as fs from "node:fs/promises";
import * as path from "node:path";

import { splitCommandArgs } from "./args.js";

export type SubagentWorkflowSource = "builtin" | "user";
export type SubagentWorkflowPermission = "read" | "exec" | "write";
export type SubagentWorkflowNodeType = "start" | "subagent" | "end" | "aggregator" | "parallel" | "condition" | "llm" | "http" | "code" | "knowledge";

export interface SubagentWorkflowInput {
  id: string;
  type: "string" | "number" | "boolean" | "select";
  label: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: string[];
}

export interface SubagentWorkflowNode {
  id: string;
  type: SubagentWorkflowNodeType;
  label?: string;
  agent?: string;
  task?: string;
  permission?: SubagentWorkflowPermission;
  provider?: string;
  model?: string;
  outputs?: Record<string, string>;
  output?: string;
  config?: Record<string, unknown>;
}

export interface SubagentWorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface SubagentWorkflow {
  id: string;
  name: string;
  description: string;
  version: number;
  enabled: boolean;
  inputs: SubagentWorkflowInput[];
  nodes: SubagentWorkflowNode[];
  edges: SubagentWorkflowEdge[];
  source?: SubagentWorkflowSource;
}

export interface SubagentWorkflowValidationResult {
  ok: boolean;
  errors: string[];
}

export type ParseSubagentWorkflowCommandArgsResult = { workflowId: string; task: string } | { error: string };

const WORKFLOW_DIR_NAME = "subagent-workflows";
const WORKFLOW_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const MAX_WORKFLOW_NODES = 32;
const MAX_WORKFLOW_EDGES = 64;
const SUPPORTED_RUNTIME_NODE_TYPES = new Set<SubagentWorkflowNodeType>([
  "start",
  "subagent",
  "aggregator",
  "end",
]);
const USAGE = "Usage: /subagent [--workflow|--scheme <workflow-id>] <task>";

const builtinWorkflows: SubagentWorkflow[] = [
  {
    id: "quick-scout",
    name: "快速侦察",
    description: "使用 scout 进行 read-only 快速代码侦察。",
    version: 1,
    enabled: true,
    inputs: [{ id: "task", type: "string", label: "任务", required: true }],
    nodes: [
      { id: "start", type: "start", outputs: { task: "{{input.task}}" } },
      { id: "scout", type: "subagent", agent: "scout", permission: "read", task: "{{start.task}}" },
      { id: "end", type: "end", output: "{{scout.output}}" },
    ],
    edges: [
      { from: "start", to: "scout" },
      { from: "scout", to: "end" },
    ],
    source: "builtin",
  },
  {
    id: "scout-plan",
    name: "侦察 + 计划",
    description: "先用 scout 收集上下文，再由 planner 产出计划。",
    version: 1,
    enabled: false,
    inputs: [{ id: "task", type: "string", label: "任务", required: true }],
    nodes: [
      { id: "start", type: "start", outputs: { task: "{{input.task}}" } },
      { id: "scout", type: "subagent", agent: "scout", permission: "read", task: "{{start.task}}" },
      { id: "planner", type: "subagent", agent: "planner", permission: "read", task: "Create a plan from this context:\n\n{{scout.output}}" },
      { id: "end", type: "end", output: "{{planner.output}}" },
    ],
    edges: [
      { from: "start", to: "scout" },
      { from: "scout", to: "planner" },
      { from: "planner", to: "end" },
    ],
    source: "builtin",
  },
  {
    id: "implement",
    name: "实现",
    description: "使用 worker 执行明确的实现任务。",
    version: 1,
    enabled: false,
    inputs: [{ id: "task", type: "string", label: "任务", required: true }],
    nodes: [
      { id: "start", type: "start", outputs: { task: "{{input.task}}" } },
      { id: "worker", type: "subagent", agent: "worker", permission: "write", task: "{{start.task}}" },
      { id: "end", type: "end", output: "{{worker.output}}" },
    ],
    edges: [
      { from: "start", to: "worker" },
      { from: "worker", to: "end" },
    ],
    source: "builtin",
  },
  {
    id: "implement-review",
    name: "实现 + Review",
    description: "worker 实现，reviewer 审查，再由 worker 修复审查意见。",
    version: 1,
    enabled: false,
    inputs: [{ id: "task", type: "string", label: "任务", required: true }],
    nodes: [
      { id: "start", type: "start", outputs: { task: "{{input.task}}" } },
      { id: "worker-1", type: "subagent", agent: "worker", permission: "write", task: "{{start.task}}" },
      { id: "reviewer", type: "subagent", agent: "reviewer", permission: "read", task: "Review this implementation:\n\n{{worker-1.output}}" },
      { id: "worker-2", type: "subagent", agent: "worker", permission: "write", task: "Fix review findings:\n\n{{reviewer.output}}" },
      { id: "end", type: "end", output: "{{worker-2.output}}" },
    ],
    edges: [
      { from: "start", to: "worker-1" },
      { from: "worker-1", to: "reviewer" },
      { from: "reviewer", to: "worker-2" },
      { from: "worker-2", to: "end" },
    ],
    source: "builtin",
  },
  {
    id: "parallel-scout",
    name: "并行侦察",
    description: "多个 scout 按依赖层真正并行侦察，适合较大项目。",
    version: 1,
    enabled: true,
    inputs: [{ id: "task", type: "string", label: "任务", required: true }],
    nodes: [
      { id: "start", type: "start", outputs: { task: "{{input.task}}" } },
      { id: "scout-code", type: "subagent", agent: "scout", permission: "read", task: "Find relevant code for: {{start.task}}" },
      { id: "scout-tests", type: "subagent", agent: "scout", permission: "read", task: "Find relevant tests for: {{start.task}}" },
      { id: "scout-docs", type: "subagent", agent: "scout", permission: "read", task: "Find relevant docs/config for: {{start.task}}" },
      { id: "aggregator", type: "aggregator", output: "{{scout-code.output}}\n\n{{scout-tests.output}}\n\n{{scout-docs.output}}" },
      { id: "end", type: "end", output: "{{aggregator.output}}" },
    ],
    edges: [
      { from: "start", to: "scout-code" },
      { from: "start", to: "scout-tests" },
      { from: "start", to: "scout-docs" },
      { from: "scout-code", to: "aggregator" },
      { from: "scout-tests", to: "aggregator" },
      { from: "scout-docs", to: "aggregator" },
      { from: "aggregator", to: "end" },
    ],
    source: "builtin",
  },
];

export function getBuiltinSubagentWorkflows(): SubagentWorkflow[] {
  return builtinWorkflows.map((workflow) => ({ ...workflow, source: "builtin" }));
}

export async function listSubagentWorkflows(
  piConfigDir: string,
): Promise<{ workflows: SubagentWorkflow[]; diagnostics: string[] }> {
  const map = new Map<string, SubagentWorkflow>();
  const diagnostics: string[] = [];
  for (const workflow of getBuiltinSubagentWorkflows()) map.set(workflow.id, workflow);
  const userDir = path.join(piConfigDir, WORKFLOW_DIR_NAME);
  let entries: string[];
  try {
    entries = await fs.readdir(userDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { workflows: Array.from(map.values()), diagnostics };
    throw error;
  }

  for (const entry of entries.filter((file) => file.endsWith(".json")).sort()) {
    const filePath = path.join(userDir, entry);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      diagnostics.push(
        `Skipped workflow file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const workflow = parsed as SubagentWorkflow;
    const validation = validateSubagentWorkflow(workflow);
    if (!validation.ok) {
      diagnostics.push(`Skipped workflow file ${filePath}: ${validation.errors.join(" ")}`);
      continue;
    }
    map.set(workflow.id, { ...workflow, source: "user" });
  }
  return { workflows: Array.from(map.values()), diagnostics };
}

export function validateSubagentWorkflow(workflow: SubagentWorkflow): SubagentWorkflowValidationResult {
  const errors: string[] = [];
  if (!workflow || typeof workflow !== "object") {
    return { ok: false, errors: ["Workflow must be an object."] };
  }
  if (!WORKFLOW_ID_PATTERN.test(workflow.id)) errors.push("Workflow id must use only letters, numbers, underscores, or dashes.");
  if (!workflow.name?.trim()) errors.push("Workflow name is required.");
  if (!Number.isInteger(workflow.version) || workflow.version < 1) errors.push("Workflow version must be a positive integer.");
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push("Workflow nodes must be a non-empty array.");
    return { ok: false, errors };
  }
  if (workflow.nodes.length > MAX_WORKFLOW_NODES) {
    errors.push(`Workflow exceeds the maximum of ${MAX_WORKFLOW_NODES} nodes.`);
  }
  if (!Array.isArray(workflow.edges)) {
    errors.push("Workflow edges must be an array.");
    return { ok: false, errors };
  }
  if (workflow.edges.length > MAX_WORKFLOW_EDGES) {
    errors.push(`Workflow exceeds the maximum of ${MAX_WORKFLOW_EDGES} edges.`);
  }
  const startCount = workflow.nodes.filter((node) => node.type === "start").length;
  const endCount = workflow.nodes.filter((node) => node.type === "end").length;
  if (startCount !== 1) errors.push("Workflow must contain exactly one start node.");
  if (endCount !== 1) errors.push("Workflow must contain exactly one end node.");
  const nodeIds = new Set<string>();
  let startId: string | undefined;
  let endId: string | undefined;
  workflow.nodes.forEach((node, index) => {
    const label = `Node ${index + 1}`;
    if (!node.id?.trim()) errors.push(`${label} is missing id.`);
    if (nodeIds.has(node.id)) errors.push(`${label} duplicates node id: ${node.id}.`);
    nodeIds.add(node.id);
    if (!SUPPORTED_RUNTIME_NODE_TYPES.has(node.type)) {
      errors.push(`${label} uses node type ${node.type}, which is not supported by the subagent runtime.`);
    }
    if (node.type === "subagent" && !node.agent?.trim()) errors.push(`${label} subagent node must declare agent.`);
    if (node.type === "subagent" && !node.task?.trim()) errors.push(`${label} subagent node must declare task.`);
    if (node.permission && !["read", "exec", "write"].includes(node.permission)) errors.push(`${label} has invalid permission: ${node.permission}.`);
    if (node.type === "start") startId = node.id;
    if (node.type === "end") endId = node.id;
  });

  // Structural edge checks.
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  workflow.edges.forEach((edge, index) => {
    const label = `Edge ${index + 1}`;
    if (!edge || typeof edge !== "object") {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (!nodeIds.has(edge.from)) errors.push(`${label} references unknown source node: ${edge.from}.`);
    if (!nodeIds.has(edge.to)) errors.push(`${label} references unknown target node: ${edge.to}.`);
    if (edge.condition) {
      errors.push(`${label} uses a condition, which is not supported by the subagent runtime.`);
    }
    if (nodeIds.has(edge.from)) (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge.to);
    if (nodeIds.has(edge.to)) (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge.from);
  });

  // The unique start node must be a root (in-degree 0) and the unique end node a sink (out-degree 0).
  if (startId && (incoming.get(startId)?.length ?? 0) > 0) {
    errors.push("Start node must not have incoming edges.");
  }
  if (endId && (outgoing.get(endId)?.length ?? 0) > 0) {
    errors.push("End node must not have outgoing edges.");
  }

  // Every node must be reachable from start and must be able to reach end.
  if (startId && endId) {
    const reachableFromStart = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachableFromStart.has(current)) continue;
      reachableFromStart.add(current);
      for (const next of outgoing.get(current) ?? []) stack.push(next);
    }
    const reachesEnd = new Set<string>();
    const reverseStack = [endId];
    while (reverseStack.length > 0) {
      const current = reverseStack.pop()!;
      if (reachesEnd.has(current)) continue;
      reachesEnd.add(current);
      for (const prev of incoming.get(current) ?? []) reverseStack.push(prev);
    }
    for (const node of workflow.nodes) {
      if (!reachableFromStart.has(node.id)) errors.push(`Node ${node.id} is not reachable from start.`);
      if (!reachesEnd.has(node.id)) errors.push(`Node ${node.id} cannot reach the end node.`);
    }
  }

  if (errors.length === 0) {
    try {
      getWorkflowExecutionBatches(workflow);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { ok: errors.length === 0, errors };
}

export function parseSubagentWorkflowCommandArgs(args: string): ParseSubagentWorkflowCommandArgsResult {
  const tokens = splitCommandArgs(args);
  if (tokens.length === 0) return { error: USAGE };
  if (tokens[0] === "--workflow" || tokens[0] === "--scheme") {
    const workflowId = tokens[1];
    if (!workflowId || tokens.length < 3) return { error: USAGE };
    return { workflowId, task: tokens.slice(2).join(" ") };
  }
  if (tokens.length < 2) return { error: USAGE };
  return { workflowId: tokens[0], task: tokens.slice(1).join(" ") };
}

export function renderWorkflowTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function getWorkflowExecutionBatches(workflow: SubagentWorkflow): SubagentWorkflowNode[][] {
  const incoming = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }

  let ready = workflow.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  const batches: SubagentWorkflowNode[][] = [];
  let processed = 0;

  while (ready.length > 0) {
    const batch = ready;
    batches.push(batch);
    processed += batch.length;
    const nextIds = new Set<string>();

    for (const node of batch) {
      for (const next of outgoing.get(node.id) ?? []) {
        const count = (incoming.get(next) ?? 0) - 1;
        incoming.set(next, count);
        if (count === 0) nextIds.add(next);
      }
    }

    ready = workflow.nodes.filter((node) => nextIds.has(node.id));
  }

  if (processed !== workflow.nodes.length) {
    throw new Error(`Workflow ${workflow.id} contains a dependency cycle.`);
  }
  return batches;
}

export function sortWorkflowNodes(workflow: SubagentWorkflow): SubagentWorkflowNode[] {
  return getWorkflowExecutionBatches(workflow).flat();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
