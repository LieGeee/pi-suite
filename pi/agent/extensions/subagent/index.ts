/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *   - Background parallel: { tasks: [...], background: true }
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  type ExtensionAPI,
  getAgentDir,
  getMarkdownTheme,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import { decideProjectAgentApproval } from "./project-approval.js";
import { validateDelegationPolicy } from "./delegation-policy.js";
import {
  buildSubagentBaseArgs,
  resolveSubagentPiInvocation,
} from "./invocation.js";
import {
  limitHandoffOutput,
  limitToolOutput,
  createBoundedStderrBuffer,
  MAX_STDERR_CHARS,
} from "./output-policy.js";
import {
  getEffectiveTools,
  parseSubagentCommandArgs,
  type SubagentPermission,
} from "./permissions.js";
import { createJsonLineDecoder } from "./jsonl.js";
import { killProcessTree, waitForChildProcess } from "./process-control.js";
import { runWithSubagentRetry } from "./retry-policy.js";
import {
  classifySubagentExit,
  getFinalAssistantText,
  hasFailedSubagentResults,
  resolveSubagentTimeoutSeconds,
} from "./runtime-policy.js";
import { ConcurrencyScheduler } from "./scheduler.js";
import {
  closeSubagentAttemptSpans,
  createSubagentTimingTracker,
  finishSubagentTiming,
  formatSubagentTiming,
  observeSubagentEvent,
  recordSubagentRetry,
  type SubagentTiming,
  type SubagentTimingTracker,
} from "./telemetry.js";
import {
  getWorkflowExecutionBatches,
  listSubagentWorkflows,
  parseSubagentWorkflowCommandArgs,
  renderWorkflowTemplate,
  type SubagentWorkflow,
  type SubagentWorkflowNode,
} from "./workflows.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CHAIN_STEPS = 8;
const MAX_CONCURRENCY = 4;
const MAX_PROVIDER_CONCURRENCY = 2;
const SUBAGENT_SCHEDULER = new ConcurrencyScheduler(
  MAX_CONCURRENCY,
  MAX_PROVIDER_CONCURRENCY,
);
const COLLAPSED_ITEM_COUNT = 10;

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens?: number;
    turns?: number;
  },
  model?: string,
): string {
  const parts: string[] = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0) {
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  }
  if (model) parts.push(model);
  return parts.join(" ");
}

function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  themeFg: (color: any, text: string) => string,
): string {
  const shortenPath = (p: string) => {
    const home = os.homedir();
    return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  };

  switch (toolName) {
    case "bash": {
      const command = (args.command as string) || "...";
      const preview =
        command.length > 60 ? `${command.slice(0, 60)}...` : command;
      return themeFg("muted", "$ ") + themeFg("toolOutput", preview);
    }
    case "read": {
      const rawPath = (args.file_path || args.path || "...") as string;
      const filePath = shortenPath(rawPath);
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      let text = themeFg("accent", filePath);
      if (offset !== undefined || limit !== undefined) {
        const startLine = offset ?? 1;
        const endLine = limit !== undefined ? startLine + limit - 1 : "";
        text += themeFg(
          "warning",
          `:${startLine}${endLine ? `-${endLine}` : ""}`,
        );
      }
      return themeFg("muted", "read ") + text;
    }
    case "write": {
      const rawPath = (args.file_path || args.path || "...") as string;
      const filePath = shortenPath(rawPath);
      const content = (args.content || "") as string;
      const lines = content.split("\n").length;
      let text = themeFg("muted", "write ") + themeFg("accent", filePath);
      if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
      return text;
    }
    case "edit": {
      const rawPath = (args.file_path || args.path || "...") as string;
      return (
        themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath))
      );
    }
    case "ls": {
      const rawPath = (args.path || ".") as string;
      return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
    }
    case "find": {
      const pattern = (args.pattern || "*") as string;
      const rawPath = (args.path || ".") as string;
      return (
        themeFg("muted", "find ") +
        themeFg("accent", pattern) +
        themeFg("dim", ` in ${shortenPath(rawPath)}`)
      );
    }
    case "grep": {
      const pattern = (args.pattern || "") as string;
      const rawPath = (args.path || ".") as string;
      return (
        themeFg("muted", "grep ") +
        themeFg("accent", `/${pattern}/`) +
        themeFg("dim", ` in ${shortenPath(rawPath)}`)
      );
    }
    default: {
      const argsStr = JSON.stringify(args);
      const preview =
        argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
      return themeFg("accent", toolName) + themeFg("dim", ` ${preview}`);
    }
  }
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface SingleResult {
  agent: string;
  agentSource: "user" | "project" | "unknown";
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
  permission?: SubagentPermission;
  effectiveTools?: string[];
  timeoutSeconds?: number;
  attempts?: number;
  retryDelayMs?: number;
  retryErrors?: string[];
  timing?: SubagentTiming;
}

function formatResultStats(result: SingleResult): string {
  const usage = formatUsageStats(result.usage, result.model);
  const timing = result.timing ? formatSubagentTiming(result.timing) : "";
  return [usage, timing].filter(Boolean).join(" | ");
}

interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: SingleResult[];
  workflow?: { id: string; name: string };
  background?: {
    jobId: string;
    status: "running" | "completed" | "failed";
  };
}

function getFinalOutput(messages: Message[]): string {
  return getFinalAssistantText(messages);
}

function summarizeParallelResults(results: SingleResult[]): string {
  const successCount = results.filter((result) => result.exitCode === 0).length;
  const summaries = results.map((result) => {
    const output =
      getFinalOutput(result.messages) ||
      result.errorMessage ||
      result.stderr.trim();
    const preview = output.slice(0, 100) + (output.length > 100 ? "..." : "");
    return `[${result.agent}] ${result.exitCode === 0 ? "completed" : "failed"}: ${preview || "(no output)"}`;
  });
  return `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`;
}

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({
            type: "toolCall",
            name: part.name,
            args: part.arguments,
          });
      }
    }
  }
  return items;
}

function getAgentProviderKey(agents: AgentConfig[], agentName: string): string {
  const agent = agents.find((candidate) => candidate.name === agentName);
  if (!agent) return `unknown:${agentName}`;
  return agent.provider ?? "default-provider";
}

async function writePromptToTempFile(
  agentName: string,
  prompt: string,
): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "pi-subagent-"),
  );
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, {
      encoding: "utf-8",
      mode: 0o600,
    });
  });
  return { dir: tmpDir, filePath };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runSingleAgentAttempt(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  cwd: string | undefined,
  permission: SubagentPermission | undefined,
  timeoutSeconds: number | undefined,
  attempt: number,
  timingTracker: SubagentTimingTracker,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
): Promise<SingleResult> {
  const agent = agents.find((a) => a.name === agentName);

  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
      step,
    };
  }

  const effectivePermission = permission ?? "read";
  const effectiveTools = getEffectiveTools(agent.tools, effectivePermission);
  const effectiveTimeoutSeconds = resolveSubagentTimeoutSeconds(
    effectivePermission,
    timeoutSeconds,
  );
  const args = buildSubagentBaseArgs(
    { provider: agent.provider, model: agent.model, thinking: agent.thinking },
    effectiveTools,
  );

  let tmpPromptDir: string | null = null;
  let tmpPromptPath: string | null = null;

  const currentResult: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    model: agent.model,
    step,
    permission: effectivePermission,
    effectiveTools,
    timeoutSeconds: effectiveTimeoutSeconds,
    attempts: attempt,
  };

  const emitUpdate = () => {
    if (onUpdate) {
      onUpdate({
        content: [
          {
            type: "text",
            text: limitToolOutput(
              getFinalOutput(currentResult.messages) || "(running...)",
            ).text,
          },
        ],
        details: makeDetails([currentResult]),
      });
    }
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      tmpPromptPath = tmp.filePath;
      args.push("--append-system-prompt", tmpPromptPath);
    }

    args.push(`Task: ${task}`);
    let wasAborted = false;
    let timedOut = false;
    let spawnError: string | undefined;
    const stdoutLines = createJsonLineDecoder();

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = resolveSubagentPiInvocation(args, {
        agentDir: getAgentDir(),
      });
      const proc = spawn(invocation.command, invocation.args, {
        cwd: cwd ?? defaultCwd,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let closed = false;
      let settled = false;
      let terminated = false;
      let timeoutTimer: NodeJS.Timeout | undefined;
      let forceKillTimer: NodeJS.Timeout | undefined;
      let abortListener: (() => void) | undefined;
      const stderrBuffer = createBoundedStderrBuffer(MAX_STDERR_CHARS);
      const stderrDecoder = new StringDecoder("utf8");

      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (signal && abortListener)
          signal.removeEventListener("abort", abortListener);
        stderrBuffer.append(stderrDecoder.end());
        currentResult.stderr = stderrBuffer.text;
        resolve(code);
      };

      const terminate = (reason: "abort" | "timeout") => {
        if (terminated || closed || settled) return;
        terminated = true;
        if (reason === "abort") wasAborted = true;
        else timedOut = true;
        if (proc.pid) killProcessTree(proc.pid);
        else {
          try {
            proc.kill("SIGKILL");
          } catch {
            // The process may have failed before receiving a PID.
          }
        }
        forceKillTimer = setTimeout(() => {
          if (!closed && proc.pid) killProcessTree(proc.pid);
          finish(reason === "timeout" ? 124 : 130);
        }, 5000);
        forceKillTimer.unref();
      };

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          // Malformed JSONL from a child must not be silently dropped. Count it
          // so the final result can carry a diagnostic.
          stdoutLines.noteMalformedLine(line);
          return;
        }
        observeSubagentEvent(timingTracker, event, Date.now());

        if (event.type === "message_end" && event.message) {
          const msg = event.message as Message;
          currentResult.messages.push(msg);

          if (msg.role === "assistant") {
            currentResult.usage.turns++;
            const usage = msg.usage;
            if (usage) {
              currentResult.usage.input += usage.input || 0;
              currentResult.usage.output += usage.output || 0;
              currentResult.usage.cacheRead += usage.cacheRead || 0;
              currentResult.usage.cacheWrite += usage.cacheWrite || 0;
              currentResult.usage.cost += usage.cost?.total || 0;
              currentResult.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!currentResult.model && msg.model)
              currentResult.model = msg.model;
            if (msg.stopReason) currentResult.stopReason = msg.stopReason;
            if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
          }
          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          currentResult.messages.push(event.message as Message);
          emitUpdate();
        }
      };

      proc.stdout.on("data", (data) => {
        for (const line of stdoutLines.write(data)) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        stderrBuffer.append(stderrDecoder.write(data));
      });

      waitForChildProcess(proc)
        .then((code) => {
          closed = true;
          for (const line of stdoutLines.flush()) processLine(line);
          finish(code);
        })
        .catch((error: Error) => {
          closed = true;
          spawnError = error.message;
          // Defense in depth: only a child-level error (rare spawn failure) reaches
          // here; ensure no process tree is left behind before settling.
          if (proc.pid) killProcessTree(proc.pid);
          finish(1);
        });

      timeoutTimer = setTimeout(
        () => terminate("timeout"),
        effectiveTimeoutSeconds * 1000,
      );
      timeoutTimer.unref();

      if (signal) {
        abortListener = () => terminate("abort");
        if (signal.aborted) abortListener();
        else signal.addEventListener("abort", abortListener, { once: true });
      }
    });

    if (stdoutLines.droppedLines > 0 || stdoutLines.malformedLines > 0) {
      const notes: string[] = [];
      if (stdoutLines.droppedLines > 0) {
        notes.push(
          `${stdoutLines.droppedLines} oversized JSONL record(s)${stdoutLines.droppedPreview ? ": " + stdoutLines.droppedPreview : ""}`,
        );
      }
      if (stdoutLines.malformedLines > 0) {
        notes.push(
          `${stdoutLines.malformedLines} malformed JSONL record(s)${stdoutLines.malformedPreview ? ": " + stdoutLines.malformedPreview : ""}`,
        );
      }
      const note = `[Child emitted ${notes.join("; ")}]`;
      currentResult.errorMessage = currentResult.errorMessage
        ? `${currentResult.errorMessage} ${note}`
        : note;
    }

    if (wasAborted) throw new Error("Subagent was aborted");
    const classification = classifySubagentExit({
      exitCode,
      finalOutput: getFinalOutput(currentResult.messages),
      stderr: currentResult.stderr,
      timedOut,
      timeoutSeconds: effectiveTimeoutSeconds,
      spawnError,
      stopReason: currentResult.stopReason,
      errorMessage: currentResult.errorMessage,
    });
    currentResult.exitCode = classification.exitCode;
    if (classification.stopReason)
      currentResult.stopReason = classification.stopReason;
    if (classification.errorMessage)
      currentResult.errorMessage = classification.errorMessage;
    return currentResult;
  } finally {
    if (tmpPromptPath)
      try {
        fs.unlinkSync(tmpPromptPath);
      } catch {
        /* ignore */
      }
    if (tmpPromptDir)
      try {
        fs.rmdirSync(tmpPromptDir);
      } catch {
        /* ignore */
      }
  }
}

async function runSingleAgentNow(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  cwd: string | undefined,
  permission: SubagentPermission | undefined,
  timeoutSeconds: number | undefined,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
  queuedAtMs: number,
): Promise<SingleResult> {
  const effectivePermission = permission ?? "read";
  const startedAtMs = Date.now();
  const timingTracker = createSubagentTimingTracker(queuedAtMs, startedAtMs);
  const outcome = await runWithSubagentRetry(
    effectivePermission,
    async (attempt) => {
      if (signal?.aborted) throw new Error("Subagent was aborted");
      const result = await runSingleAgentAttempt(
        defaultCwd,
        agents,
        agentName,
        task,
        cwd,
        permission,
        timeoutSeconds,
        attempt,
        timingTracker,
        step,
        signal,
        onUpdate,
        makeDetails,
      );
      closeSubagentAttemptSpans(timingTracker, Date.now());
      return result;
    },
    { signal },
  );

  recordSubagentRetry(timingTracker, outcome.retryDelayMs);
  outcome.result.attempts = outcome.attempts;
  outcome.result.retryDelayMs = outcome.retryDelayMs;
  outcome.result.retryErrors = outcome.retryErrors;
  outcome.result.timing = finishSubagentTiming(
    timingTracker,
    Date.now(),
    outcome.attempts,
  );
  return outcome.result;
}

async function runSingleAgent(
  defaultCwd: string,
  agents: AgentConfig[],
  agentName: string,
  task: string,
  cwd: string | undefined,
  permission: SubagentPermission | undefined,
  timeoutSeconds: number | undefined,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
  queuedAtMs: number = Date.now(),
): Promise<SingleResult> {
  const providerKey = getAgentProviderKey(agents, agentName);
  return SUBAGENT_SCHEDULER.run(
    providerKey,
    () =>
      runSingleAgentNow(
        defaultCwd,
        agents,
        agentName,
        task,
        cwd,
        permission,
        timeoutSeconds,
        step,
        signal,
        onUpdate,
        makeDetails,
        queuedAtMs,
      ),
    signal,
  );
}

const PermissionSchema = StringEnum(["read", "exec", "write"] as const, {
  description:
    'Child-agent permission level. Default: "read". "exec" adds bash. "write" adds edit/write.',
  default: "read",
});

const TimeoutSecondsSchema = Type.Integer({
  description:
    "Maximum child runtime in seconds. Defaults to 120 for read and 300 for exec/write.",
  minimum: 5,
  maximum: 1800,
});

const TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
  permission: Type.Optional(PermissionSchema),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for the agent process" }),
  ),
  timeoutSeconds: Type.Optional(TimeoutSecondsSchema),
});

const ChainItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({
    description: "Task with optional {previous} placeholder for prior output",
  }),
  permission: Type.Optional(PermissionSchema),
  cwd: Type.Optional(
    Type.String({ description: "Working directory for the agent process" }),
  ),
  timeoutSeconds: Type.Optional(TimeoutSecondsSchema),
});

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description:
    'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
  default: "user",
});

const SubagentParams = Type.Object({
  agent: Type.Optional(
    Type.String({
      description: "Name of the agent to invoke (for single mode)",
    }),
  ),
  task: Type.Optional(
    Type.String({ description: "Task to delegate (for single mode)" }),
  ),
  tasks: Type.Optional(
    Type.Array(TaskItem, {
      description: "Array of {agent, task} for parallel execution",
      maxItems: MAX_PARALLEL_TASKS,
    }),
  ),
  chain: Type.Optional(
    Type.Array(ChainItem, {
      description: "Array of {agent, task} for sequential execution",
      maxItems: MAX_CHAIN_STEPS,
    }),
  ),
  background: Type.Optional(
    Type.Boolean({
      description:
        "For parallel tasks only: return immediately and post results as a follow-up. Use only for explicitly non-overlapping work.",
    }),
  ),
  permission: Type.Optional(PermissionSchema),
  timeoutSeconds: Type.Optional(TimeoutSecondsSchema),
  explicitUserRequest: Type.Optional(
    Type.Boolean({
      description:
        "Set true only when the user explicitly requested subagent use. Required for single, chain, exec, or write delegation.",
    }),
  ),
  agentScope: Type.Optional(AgentScopeSchema),
  confirmProjectAgents: Type.Optional(
    Type.Boolean({
      description: "Prompt before running project-local agents. Default: true.",
      default: true,
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the agent process (single mode)",
    }),
  ),
});

function applyWorkflowNodeModelSelection(
  agents: AgentConfig[],
  node: SubagentWorkflowNode,
): AgentConfig[] {
  if (!node.agent || (!node.provider && !node.model)) return agents;
  return agents.map((agent) => {
    if (agent.name !== node.agent) return agent;
    return {
      ...agent,
      provider: node.provider ?? agent.provider,
      model: node.model ?? agent.model,
    };
  });
}

function buildWorkflowDetails(
  workflow: SubagentWorkflow,
  agentScope: AgentScope,
  projectAgentsDir: string | null,
  results: SingleResult[],
): SubagentDetails {
  return {
    mode: "chain",
    agentScope,
    projectAgentsDir,
    results,
    workflow: { id: workflow.id, name: workflow.name },
  };
}

type WorkflowNodeOutcome =
  | {
      kind: "start";
      node: SubagentWorkflowNode;
      outputs: Record<string, string>;
    }
  | {
      kind: "subagent";
      node: SubagentWorkflowNode;
      result: SingleResult;
      output: string;
      isError: boolean;
    }
  | { kind: "output"; node: SubagentWorkflowNode; output: string };

async function runSubagentWorkflow(
  workflow: SubagentWorkflow,
  task: string,
  defaultCwd: string,
  agents: AgentConfig[],
  agentScope: AgentScope,
  projectAgentsDir: string | null,
  signal: AbortSignal | undefined,
): Promise<{
  output: string;
  details: SubagentDetails;
  isError: boolean;
  errorMessage?: string;
}> {
  const values: Record<string, string> = { "input.task": task };
  const results: SingleResult[] = [];
  let step = 1;
  let finalOutput = "";

  for (const batch of getWorkflowExecutionBatches(workflow)) {
    const stepByNodeId = new Map<string, number>();
    for (const node of batch) {
      if (node.type === "subagent") stepByNodeId.set(node.id, step++);
    }
    const enqueuedAtMs = Date.now();
    const outcomes = await Promise.all(
      batch.map(async (node): Promise<WorkflowNodeOutcome> => {
        if (node.type === "start") {
          const outputs = Object.fromEntries(
            Object.entries(node.outputs ?? {}).map(([key, template]) => [
              `${node.id}.${key}`,
              limitHandoffOutput(renderWorkflowTemplate(template, values)).text,
            ]),
          );
          return { kind: "start", node, outputs };
        }

        if (node.type === "subagent") {
          const renderedTask = limitHandoffOutput(
            renderWorkflowTemplate(node.task ?? "", values),
          ).text;
          const makeDetails = (partialResults: SingleResult[]) =>
            buildWorkflowDetails(workflow, agentScope, projectAgentsDir, [
              ...results,
              ...partialResults,
            ]);
          const nodeAgents = applyWorkflowNodeModelSelection(agents, node);
          const result = await runSingleAgent(
            defaultCwd,
            nodeAgents,
            node.agent ?? "",
            renderedTask,
            undefined,
            node.permission,
            undefined,
            stepByNodeId.get(node.id),
            signal,
            undefined,
            makeDetails,
            enqueuedAtMs,
          );
          const output =
            getFinalOutput(result.messages) ||
            result.errorMessage ||
            result.stderr ||
            "";
          const isError =
            result.exitCode !== 0 ||
            result.stopReason === "error" ||
            result.stopReason === "aborted";
          return { kind: "subagent", node, result, output, isError };
        }

        if (node.type === "aggregator") {
          return {
            kind: "output",
            node,
            output: renderWorkflowTemplate(node.output ?? "", values),
          };
        }
        if (node.type === "end") {
          return {
            kind: "output",
            node,
            output: renderWorkflowTemplate(node.output ?? finalOutput, values),
          };
        }
        throw new Error(
          `Workflow ${workflow.id} uses unsupported node type ${node.type}.`,
        );
      }),
    );

    let failedOutcome:
      | Extract<WorkflowNodeOutcome, { kind: "subagent" }>
      | undefined;
    for (const outcome of outcomes) {
      if (outcome.kind === "start") {
        Object.assign(values, outcome.outputs);
        continue;
      }
      if (outcome.kind === "subagent") {
        results.push(outcome.result);
        values[`${outcome.node.id}.output`] = limitHandoffOutput(
          outcome.output,
        ).text;
        finalOutput = outcome.output;
        if (outcome.isError && !failedOutcome) failedOutcome = outcome;
        continue;
      }
      if (outcome.kind === "output") {
        values[`${outcome.node.id}.output`] = limitHandoffOutput(
          outcome.output,
        ).text;
        finalOutput = outcome.output;
      }
    }

    if (failedOutcome) {
      return {
        output: limitToolOutput(
          `Workflow ${workflow.name} stopped at ${failedOutcome.node.id}: ${failedOutcome.output || "(no output)"}`,
        ).text,
        details: buildWorkflowDetails(
          workflow,
          agentScope,
          projectAgentsDir,
          results,
        ),
        isError: true,
        errorMessage: failedOutcome.output,
      };
    }
  }

  return {
    output: limitToolOutput(finalOutput || "(no output)").text,
    details: buildWorkflowDetails(
      workflow,
      agentScope,
      projectAgentsDir,
      results,
    ),
    isError: false,
  };
}

export default function (pi: ExtensionAPI) {
  const backgroundControllers = new Map<string, AbortController>();
  let backgroundSequence = 0;
  let shuttingDown = false;

  const postBackgroundMessage = (content: string, details: SubagentDetails) => {
    if (shuttingDown) return;
    try {
      pi.sendMessage(
        { customType: "subagent-background", content, display: true, details },
        { deliverAs: "followUp", triggerTurn: true },
      );
    } catch (error) {
      console.error(
        `[subagent] Could not post background result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  pi.on("session_shutdown", () => {
    shuttingDown = true;
    for (const controller of backgroundControllers.values()) controller.abort();
    backgroundControllers.clear();
  });

  pi.on("tool_result", (event) => {
    if (event.toolName !== "subagent") return;
    if (
      hasFailedSubagentResults(event.details as SubagentDetails | undefined)
    ) {
      return { isError: true };
    }
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context.",
      "By default each call waits for all child results before the caller can make a later tool call. Pi can execute it alongside independent sibling tool calls emitted in the same assistant response; never claim main-agent work is proceeding in parallel unless those calls were actually emitted.",
      "Set background=true with tasks to return immediately; results are posted later as a follow-up. Background work must be explicitly requested and use non-overlapping files.",
      "Default policy permits only 2+ independent read-only parallel tasks. Single, chain, exec, and write delegation require explicitUserRequest=true and an actual explicit user request.",
      "Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder), background parallel (tasks plus background=true).",
      'Permission defaults to "read" (read/grep/find/ls). Use "exec" for bash or "write" for edit/write.',
      "Child runtime defaults to 120s for read and 300s for exec/write; timeoutSeconds overrides it per call or task.",
      'Default agent scope is "user" (from ~/.pi/agent/agents).',
      'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
    ].join(" "),
    promptSnippet:
      "Run isolated child agents; use background=true when the parent must continue immediately.",
    promptGuidelines: [
      "Use subagent only for isolated tasks. Default calls wait for child results before the caller can issue later tool calls.",
      "When the parent must continue working after dispatch, use background=true with parallel tasks and explicitly non-overlapping files; the tool returns a job id immediately and posts the results as a follow-up.",
      "Treat requests such as 主线程继续, 边跑边做, 不要等, or 多开几个 as a preference for background=true unless the parent explicitly needs child results before deciding the next change.",
      "For same-turn main-agent/subagent parallelism without background mode, emit all independent main-agent tool calls in the same assistant response as subagent.",
    ],
    executionMode: "parallel",
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const agentScope: AgentScope = params.agentScope ?? "user";
      const discovery = discoverAgents(ctx.cwd, agentScope);
      const agents = discovery.agents;
      const confirmProjectAgents = params.confirmProjectAgents ?? true;

      const hasChain = (params.chain?.length ?? 0) > 0;
      const hasTasks = (params.tasks?.length ?? 0) > 0;
      const hasSingle = Boolean(params.agent && params.task);
      const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

      const makeDetails =
        (mode: "single" | "parallel" | "chain") =>
        (results: SingleResult[]): SubagentDetails => ({
          mode,
          agentScope,
          projectAgentsDir: discovery.projectAgentsDir,
          results,
        });

      if (modeCount !== 1) {
        const available =
          agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
        throw new Error(
          `Invalid parameters. Provide exactly one mode. Available agents: ${available}`,
        );
      }

      const mode = hasChain ? "chain" : hasTasks ? "parallel" : "single";
      const permissions: SubagentPermission[] = hasChain
        ? params.chain!.map(
            (step) => step.permission ?? params.permission ?? "read",
          )
        : hasTasks
          ? params.tasks!.map(
              (task) => task.permission ?? params.permission ?? "read",
            )
          : [params.permission ?? "read"];
      const taskCount = hasChain
        ? params.chain!.length
        : hasTasks
          ? params.tasks!.length
          : 1;
      const policy = validateDelegationPolicy({
        mode,
        taskCount,
        permissions,
        explicitUserRequest: params.explicitUserRequest,
      });
      if (!policy.ok)
        throw new Error(`Subagent policy blocked this call: ${policy.reason}`);
      if (params.background && !params.explicitUserRequest) {
        throw new Error(
          "Background mode requires explicitUserRequest=true because work continues after the parent tool call returns.",
        );
      }

      if (agentScope === "project" || agentScope === "both") {
        const requestedAgentNames = new Set<string>();
        if (params.chain)
          for (const step of params.chain) requestedAgentNames.add(step.agent);
        if (params.tasks)
          for (const t of params.tasks) requestedAgentNames.add(t.agent);
        if (params.agent) requestedAgentNames.add(params.agent);

        const projectAgentsRequested = Array.from(requestedAgentNames)
          .map((name) => agents.find((a) => a.name === name))
          .filter((a): a is AgentConfig => a?.source === "project");

        if (projectAgentsRequested.length > 0) {
          const decision = decideProjectAgentApproval({
            projectAgentsRequested: true,
            hasUI: ctx.hasUI,
            confirmProjectAgents,
            explicitUserRequest: Boolean(params.explicitUserRequest),
          });
          if (decision?.action === "deny") {
            throw new Error(decision.reason);
          }
          if (decision?.action === "confirm") {
            const names = projectAgentsRequested.map((a) => a.name).join(", ");
            const dir = discovery.projectAgentsDir ?? "(unknown)";
            const ok = await ctx.ui.confirm(
              "Run project-local agents?",
              `Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
            );
            if (!ok)
              return {
                content: [
                  {
                    type: "text",
                    text: "Canceled: project-local agents not approved.",
                  },
                ],
                details: makeDetails(
                  hasChain ? "chain" : hasTasks ? "parallel" : "single",
                )([]),
              };
          }
        }
      }

      if (params.background && !hasTasks) {
        throw new Error("Background mode requires parallel tasks.");
      }

      if (params.background) {
        if (params.tasks!.length > MAX_PARALLEL_TASKS) {
          throw new Error(
            `Too many parallel tasks (${params.tasks!.length}). Max is ${MAX_PARALLEL_TASKS}.`,
          );
        }

        const jobId = `bg-${Date.now().toString(36)}-${(++backgroundSequence).toString(36)}`;
        const controller = new AbortController();
        backgroundControllers.set(jobId, controller);
        const enqueuedAtMs = Date.now();
        const backgroundTasks = params.tasks.map((task) => ({ ...task }));

        void (async () => {
          try {
            const results = await Promise.all(
              backgroundTasks.map((task) =>
                runSingleAgent(
                  ctx.cwd,
                  agents,
                  task.agent,
                  task.task,
                  task.cwd,
                  task.permission ?? params.permission,
                  task.timeoutSeconds ?? params.timeoutSeconds,
                  undefined,
                  controller.signal,
                  undefined,
                  makeDetails("parallel"),
                  enqueuedAtMs,
                ),
              ),
            );
            const failed = results.some(
              (result) =>
                result.exitCode !== 0 ||
                result.stopReason === "error" ||
                result.stopReason === "aborted",
            );
            postBackgroundMessage(
              `Background job ${jobId} ${failed ? "failed" : "completed"}.\n\n${summarizeParallelResults(results)}`,
              {
                ...makeDetails("parallel")(results),
                background: {
                  jobId,
                  status: failed ? "failed" : "completed",
                },
              },
            );
          } catch (error) {
            postBackgroundMessage(
              `Background job ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`,
              {
                ...makeDetails("parallel")([]),
                background: { jobId, status: "failed" },
              },
            );
          } finally {
            backgroundControllers.delete(jobId);
          }
        })();

        return {
          content: [
            {
              type: "text",
              text: `Started background subagent job ${jobId} with ${backgroundTasks.length} task${backgroundTasks.length === 1 ? "" : "s"}. Parent work may continue now; results will arrive as a follow-up.`,
            },
          ],
          details: {
            ...makeDetails("parallel")([]),
            background: { jobId, status: "running" },
          },
        };
      }

      if (params.chain && params.chain.length > 0) {
        const results: SingleResult[] = [];
        let previousOutput = "";

        for (let i = 0; i < params.chain.length; i++) {
          const step = params.chain[i];
          const taskWithContext = limitHandoffOutput(
            step.task.replace(/\{previous\}/g, previousOutput),
          ).text;

          // Create update callback that includes all previous results
          const chainUpdate: OnUpdateCallback | undefined = onUpdate
            ? (partial) => {
                // Combine completed results with current streaming result
                const currentResult = partial.details?.results[0];
                if (currentResult) {
                  const allResults = [...results, currentResult];
                  onUpdate({
                    content: partial.content,
                    details: makeDetails("chain")(allResults),
                  });
                }
              }
            : undefined;

          const result = await runSingleAgent(
            ctx.cwd,
            agents,
            step.agent,
            taskWithContext,
            step.cwd,
            step.permission ?? params.permission,
            step.timeoutSeconds ?? params.timeoutSeconds,
            i + 1,
            signal,
            chainUpdate,
            makeDetails("chain"),
          );
          results.push(result);

          const isError =
            result.exitCode !== 0 ||
            result.stopReason === "error" ||
            result.stopReason === "aborted";
          if (isError) {
            const errorMsg =
              result.errorMessage ||
              result.stderr ||
              getFinalOutput(result.messages) ||
              "(no output)";
            return {
              content: [
                {
                  type: "text",
                  text: limitToolOutput(
                    `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}`,
                  ).text,
                },
              ],
              details: makeDetails("chain")(results),
            };
          }
          previousOutput = limitHandoffOutput(
            getFinalOutput(result.messages),
          ).text;
        }
        return {
          content: [
            {
              type: "text",
              text: limitToolOutput(
                getFinalOutput(results[results.length - 1].messages) ||
                  "(no output)",
              ).text,
            },
          ],
          details: makeDetails("chain")(results),
        };
      }

      if (params.tasks && params.tasks.length > 0) {
        if (params.tasks.length > MAX_PARALLEL_TASKS) {
          throw new Error(
            `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
          );
        }

        // Track all results for streaming updates
        const allResults: SingleResult[] = new Array(params.tasks.length);

        // Initialize placeholder results
        for (let i = 0; i < params.tasks.length; i++) {
          allResults[i] = {
            agent: params.tasks[i].agent,
            agentSource: "unknown",
            task: params.tasks[i].task,
            exitCode: -1, // -1 = still running
            messages: [],
            stderr: "",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              cost: 0,
              contextTokens: 0,
              turns: 0,
            },
            permission:
              params.tasks[i].permission ?? params.permission ?? "read",
          };
        }

        const emitParallelUpdate = () => {
          if (onUpdate) {
            const running = allResults.filter((r) => r.exitCode === -1).length;
            const done = allResults.filter((r) => r.exitCode !== -1).length;
            onUpdate({
              content: [
                {
                  type: "text",
                  text: `Parallel: ${done}/${allResults.length} done, ${running} running...`,
                },
              ],
              details: makeDetails("parallel")([...allResults]),
            });
          }
        };

        const enqueuedAtMs = Date.now();
        const results = await Promise.all(
          params.tasks.map(async (t, index) => {
            const result = await runSingleAgent(
              ctx.cwd,
              agents,
              t.agent,
              t.task,
              t.cwd,
              t.permission ?? params.permission,
              t.timeoutSeconds ?? params.timeoutSeconds,
              undefined,
              signal,
              // Per-task update callback
              (partial) => {
                if (partial.details?.results[0]) {
                  allResults[index] = partial.details.results[0];
                  emitParallelUpdate();
                }
              },
              makeDetails("parallel"),
              enqueuedAtMs,
            );
            allResults[index] = result;
            emitParallelUpdate();
            return result;
          }),
        );

        return {
          content: [
            {
              type: "text",
              text: summarizeParallelResults(results),
            },
          ],
          details: makeDetails("parallel")(results),
        };
      }

      if (params.agent && params.task) {
        const result = await runSingleAgent(
          ctx.cwd,
          agents,
          params.agent,
          params.task,
          params.cwd,
          params.permission,
          params.timeoutSeconds,
          undefined,
          signal,
          onUpdate,
          makeDetails("single"),
        );
        const isError =
          result.exitCode !== 0 ||
          result.stopReason === "error" ||
          result.stopReason === "aborted";
        if (isError) {
          const errorMsg =
            result.errorMessage ||
            result.stderr ||
            getFinalOutput(result.messages) ||
            "(no output)";
          return {
            content: [
              {
                type: "text",
                text: limitToolOutput(
                  `Agent ${result.stopReason || "failed"}: ${errorMsg}`,
                ).text,
              },
            ],
            details: makeDetails("single")([result]),
          };
        }
        return {
          content: [
            {
              type: "text",
              text: limitToolOutput(
                getFinalOutput(result.messages) || "(no output)",
              ).text,
            },
          ],
          details: makeDetails("single")([result]),
        };
      }

      const available =
        agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
      throw new Error(`Invalid parameters. Available agents: ${available}`);
    },

    renderCall(args, theme, _context) {
      const scope: AgentScope = args.agentScope ?? "user";
      if (args.chain && args.chain.length > 0) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `chain (${args.chain.length} steps)`) +
          theme.fg("muted", ` [${scope}]`);
        for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
          const step = args.chain[i];
          // Clean up {previous} placeholder for display
          const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
          const preview =
            cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
          text +=
            "\n  " +
            theme.fg("muted", `${i + 1}.`) +
            " " +
            theme.fg("accent", step.agent) +
            theme.fg("dim", ` ${preview}`);
        }
        if (args.chain.length > 3)
          text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
        return new Text(text, 0, 0);
      }
      if (args.tasks && args.tasks.length > 0) {
        let text =
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg(
            "accent",
            `${args.background ? "background " : ""}parallel (${args.tasks.length} tasks)`,
          ) +
          theme.fg("muted", ` [${scope}]`);
        for (const t of args.tasks.slice(0, 3)) {
          const preview =
            t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
          text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${preview}`)}`;
        }
        if (args.tasks.length > 3)
          text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
        return new Text(text, 0, 0);
      }
      const agentName = args.agent || "...";
      const preview = args.task
        ? args.task.length > 60
          ? `${args.task.slice(0, 60)}...`
          : args.task
        : "...";
      let text =
        theme.fg("toolTitle", theme.bold("subagent ")) +
        theme.fg("accent", agentName) +
        theme.fg("muted", ` [${scope}]`);
      text += `\n  ${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as SubagentDetails | undefined;
      if (!details || details.results.length === 0) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" ? text.text : "(no output)",
          0,
          0,
        );
      }

      const mdTheme = getMarkdownTheme();

      const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
        const toShow = limit ? items.slice(-limit) : items;
        const skipped =
          limit && items.length > limit ? items.length - limit : 0;
        let text = "";
        if (skipped > 0)
          text += theme.fg("muted", `... ${skipped} earlier items\n`);
        for (const item of toShow) {
          if (item.type === "text") {
            const preview = expanded
              ? item.text
              : item.text.split("\n").slice(0, 3).join("\n");
            text += `${theme.fg("toolOutput", preview)}\n`;
          } else {
            text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
          }
        }
        return text.trimEnd();
      };

      if (details.mode === "single" && details.results.length === 1) {
        const r = details.results[0];
        const isError =
          r.exitCode !== 0 ||
          r.stopReason === "error" ||
          r.stopReason === "aborted";
        const icon = isError
          ? theme.fg("error", "✗")
          : theme.fg("success", "✓");
        const displayItems = getDisplayItems(r.messages);
        const finalOutput = getFinalOutput(r.messages);

        if (expanded) {
          const container = new Container();
          let header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
          if (isError && r.stopReason)
            header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
          container.addChild(new Text(header, 0, 0));
          if (isError && r.errorMessage)
            container.addChild(
              new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0),
            );
          container.addChild(new Spacer(1));
          container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
          container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(theme.fg("muted", "─── Output ───"), 0, 0),
          );
          if (displayItems.length === 0 && !finalOutput) {
            container.addChild(
              new Text(theme.fg("muted", "(no output)"), 0, 0),
            );
          } else {
            for (const item of displayItems) {
              if (item.type === "toolCall")
                container.addChild(
                  new Text(
                    theme.fg("muted", "→ ") +
                      formatToolCall(
                        item.name,
                        item.args,
                        theme.fg.bind(theme),
                      ),
                    0,
                    0,
                  ),
                );
            }
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(
                new Markdown(finalOutput.trim(), 0, 0, mdTheme),
              );
            }
          }
          const usageStr = formatResultStats(r);
          if (usageStr) {
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
          }
          return container;
        }

        let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}`;
        if (isError && r.stopReason)
          text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
        if (isError && r.errorMessage)
          text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
        else if (displayItems.length === 0)
          text += `\n${theme.fg("muted", "(no output)")}`;
        else {
          text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
          if (displayItems.length > COLLAPSED_ITEM_COUNT)
            text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        }
        const usageStr = formatResultStats(r);
        if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
        return new Text(text, 0, 0);
      }

      const aggregateUsage = (results: SingleResult[]) => {
        const total = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          turns: 0,
        };
        for (const r of results) {
          total.input += r.usage.input;
          total.output += r.usage.output;
          total.cacheRead += r.usage.cacheRead;
          total.cacheWrite += r.usage.cacheWrite;
          total.cost += r.usage.cost;
          total.turns += r.usage.turns;
        }
        return total;
      };

      if (details.mode === "chain") {
        const successCount = details.results.filter(
          (r) => r.exitCode === 0,
        ).length;
        const icon =
          successCount === details.results.length
            ? theme.fg("success", "✓")
            : theme.fg("error", "✗");

        if (expanded) {
          const container = new Container();
          container.addChild(
            new Text(
              icon +
                " " +
                theme.fg("toolTitle", theme.bold("chain ")) +
                theme.fg(
                  "accent",
                  `${successCount}/${details.results.length} steps`,
                ),
              0,
              0,
            ),
          );

          for (const r of details.results) {
            const rIcon =
              r.exitCode === 0
                ? theme.fg("success", "✓")
                : theme.fg("error", "✗");
            const displayItems = getDisplayItems(r.messages);
            const finalOutput = getFinalOutput(r.messages);

            container.addChild(new Spacer(1));
            container.addChild(
              new Text(
                `${theme.fg("muted", `─── Step ${r.step}: `) + theme.fg("accent", r.agent)} ${rIcon}`,
                0,
                0,
              ),
            );
            container.addChild(
              new Text(
                theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
                0,
                0,
              ),
            );
            if (r.errorMessage) {
              container.addChild(
                new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0),
              );
            }

            // Show tool calls
            for (const item of displayItems) {
              if (item.type === "toolCall") {
                container.addChild(
                  new Text(
                    theme.fg("muted", "→ ") +
                      formatToolCall(
                        item.name,
                        item.args,
                        theme.fg.bind(theme),
                      ),
                    0,
                    0,
                  ),
                );
              }
            }

            // Show final output as markdown
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(
                new Markdown(finalOutput.trim(), 0, 0, mdTheme),
              );
            }

            const stepUsage = formatResultStats(r);
            if (stepUsage)
              container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
          }

          const usageStr = formatUsageStats(aggregateUsage(details.results));
          if (usageStr) {
            container.addChild(new Spacer(1));
            container.addChild(
              new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0),
            );
          }
          return container;
        }

        // Collapsed view
        let text =
          icon +
          " " +
          theme.fg("toolTitle", theme.bold("chain ")) +
          theme.fg("accent", `${successCount}/${details.results.length} steps`);
        for (const r of details.results) {
          const rIcon =
            r.exitCode === 0
              ? theme.fg("success", "✓")
              : theme.fg("error", "✗");
          const displayItems = getDisplayItems(r.messages);
          text += `\n\n${theme.fg("muted", `─── Step ${r.step}: `)}${theme.fg("accent", r.agent)} ${rIcon}`;
          if (displayItems.length === 0 && r.errorMessage)
            text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
          else if (displayItems.length === 0)
            text += `\n${theme.fg("muted", "(no output)")}`;
          else text += `\n${renderDisplayItems(displayItems, 5)}`;
          const resultStats = formatResultStats(r);
          if (resultStats) text += `\n${theme.fg("dim", resultStats)}`;
        }
        const usageStr = formatUsageStats(aggregateUsage(details.results));
        if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
        text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text, 0, 0);
      }

      if (details.mode === "parallel") {
        const running = details.results.filter((r) => r.exitCode === -1).length;
        const successCount = details.results.filter(
          (r) => r.exitCode === 0,
        ).length;
        const failCount = details.results.filter((r) => r.exitCode > 0).length;
        const isRunning = running > 0;
        const icon = isRunning
          ? theme.fg("warning", "⏳")
          : failCount > 0
            ? theme.fg("warning", "◐")
            : theme.fg("success", "✓");
        const status = isRunning
          ? `${successCount + failCount}/${details.results.length} done, ${running} running`
          : `${successCount}/${details.results.length} tasks`;

        if (expanded && !isRunning) {
          const container = new Container();
          container.addChild(
            new Text(
              `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`,
              0,
              0,
            ),
          );

          for (const r of details.results) {
            const rIcon =
              r.exitCode === 0
                ? theme.fg("success", "✓")
                : theme.fg("error", "✗");
            const displayItems = getDisplayItems(r.messages);
            const finalOutput = getFinalOutput(r.messages);

            container.addChild(new Spacer(1));
            container.addChild(
              new Text(
                `${theme.fg("muted", "─── ") + theme.fg("accent", r.agent)} ${rIcon}`,
                0,
                0,
              ),
            );
            container.addChild(
              new Text(
                theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
                0,
                0,
              ),
            );
            if (r.errorMessage) {
              container.addChild(
                new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0),
              );
            }

            // Show tool calls
            for (const item of displayItems) {
              if (item.type === "toolCall") {
                container.addChild(
                  new Text(
                    theme.fg("muted", "→ ") +
                      formatToolCall(
                        item.name,
                        item.args,
                        theme.fg.bind(theme),
                      ),
                    0,
                    0,
                  ),
                );
              }
            }

            // Show final output as markdown
            if (finalOutput) {
              container.addChild(new Spacer(1));
              container.addChild(
                new Markdown(finalOutput.trim(), 0, 0, mdTheme),
              );
            }

            const taskUsage = formatResultStats(r);
            if (taskUsage)
              container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
          }

          const usageStr = formatUsageStats(aggregateUsage(details.results));
          if (usageStr) {
            container.addChild(new Spacer(1));
            container.addChild(
              new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0),
            );
          }
          return container;
        }

        // Collapsed view (or still running)
        let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
        for (const r of details.results) {
          const rIcon =
            r.exitCode === -1
              ? theme.fg("warning", "⏳")
              : r.exitCode === 0
                ? theme.fg("success", "✓")
                : theme.fg("error", "✗");
          const displayItems = getDisplayItems(r.messages);
          text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", r.agent)} ${rIcon}`;
          if (displayItems.length === 0 && r.errorMessage)
            text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
          else if (displayItems.length === 0)
            text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
          else text += `\n${renderDisplayItems(displayItems, 5)}`;
          const resultStats = formatResultStats(r);
          if (resultStats) text += `\n${theme.fg("dim", resultStats)}`;
        }
        if (!isRunning) {
          const usageStr = formatUsageStats(aggregateUsage(details.results));
          if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
        }
        if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        return new Text(text, 0, 0);
      }

      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
    },
  });

  pi.registerMessageRenderer<SubagentDetails>(
    "subagent-background",
    (message, { expanded }, theme) => {
      const details = message.details;
      const status = details?.background?.status ?? "completed";
      const icon =
        status === "completed"
          ? theme.fg("success", "✓")
          : status === "failed"
            ? theme.fg("error", "✗")
            : theme.fg("warning", "⏳");
      const jobId = details?.background?.jobId ?? "unknown";
      const header = `${icon} ${theme.fg("toolTitle", theme.bold("background subagent"))} ${theme.fg("muted", `[${jobId}]`)}`;
      const content = String(message.content || "(no output)");
      if (!expanded) {
        return new Text(
          `${header}\n${content.split("\n").slice(0, 12).join("\n")}\n${theme.fg("muted", "(Ctrl+O to expand)")}`,
          0,
          0,
        );
      }
      const container = new Container();
      container.addChild(new Text(header, 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(
        new Markdown(content.trim(), 0, 0, getMarkdownTheme()),
      );
      return container;
    },
  );

  pi.registerMessageRenderer<SubagentDetails>(
    "subagent-command",
    (message, { expanded }, theme) => {
      const details = message.details;
      if (!details || details.results.length === 0)
        return new Text(String(message.content || "(no output)"), 0, 0);

      if (details.workflow) {
        const isError = details.results.some(
          (result) =>
            result.exitCode !== 0 ||
            result.stopReason === "error" ||
            result.stopReason === "aborted",
        );
        const icon = isError
          ? theme.fg("error", "✗")
          : theme.fg("success", "✓");
        const header = `${icon} ${theme.fg("toolTitle", theme.bold(`/subagent ${details.workflow.name}`))}${theme.fg(
          "muted",
          ` (${details.workflow.id})`,
        )}`;

        if (!expanded) {
          let text = header;
          for (const result of details.results) {
            const rIcon =
              result.exitCode === 0
                ? theme.fg("success", "✓")
                : theme.fg("error", "✗");
            const usageStr = formatResultStats(result);
            text += `\n${rIcon} ${theme.fg("accent", result.agent)}${theme.fg("muted", result.step ? ` #${result.step}` : "")}${usageStr ? ` ${theme.fg("dim", usageStr)}` : ""}`;
          }
          const output = String(message.content || "(no output)")
            .split("\n")
            .slice(0, 10)
            .join("\n");
          text += `\n${theme.fg(isError ? "error" : "toolOutput", output)}\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
          return new Text(text, 0, 0);
        }

        const container = new Container();
        container.addChild(new Text(header, 0, 0));
        for (const result of details.results) {
          const rIcon =
            result.exitCode === 0
              ? theme.fg("success", "✓")
              : theme.fg("error", "✗");
          container.addChild(new Spacer(1));
          container.addChild(
            new Text(
              `${rIcon} ${theme.fg("accent", result.agent)}${theme.fg("muted", result.step ? ` #${result.step}` : "")}`,
              0,
              0,
            ),
          );
          container.addChild(
            new Text(
              theme.fg("muted", "Task: ") + theme.fg("dim", result.task),
              0,
              0,
            ),
          );
          const usageStr = formatResultStats(result);
          if (usageStr)
            container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
        }
        container.addChild(new Spacer(1));
        container.addChild(
          new Markdown(
            String(message.content || "(no output)").trim(),
            0,
            0,
            getMarkdownTheme(),
          ),
        );
        return container;
      }

      const result = details.results[0];
      const isError =
        result.exitCode !== 0 ||
        result.stopReason === "error" ||
        result.stopReason === "aborted";
      const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const permission = result.permission ?? "read";
      const tools = result.effectiveTools?.join(",") || "none";
      const header = `${icon} ${theme.fg("toolTitle", theme.bold(`/subagent ${result.agent}`))}${theme.fg(
        "muted",
        ` [${permission}: ${tools}]`,
      )}`;

      if (!expanded) {
        const output = String(message.content || "(no output)")
          .split("\n")
          .slice(0, 12)
          .join("\n");
        const usageStr = formatResultStats(result);
        return new Text(
          `${header}\n${theme.fg(isError ? "error" : "toolOutput", output)}${usageStr ? `\n${theme.fg("dim", usageStr)}` : ""}\n${theme.fg("muted", "(Ctrl+O to expand)")}`,
          0,
          0,
        );
      }

      const container = new Container();
      container.addChild(new Text(header, 0, 0));
      container.addChild(
        new Text(
          theme.fg("muted", "Task: ") + theme.fg("dim", result.task),
          0,
          0,
        ),
      );
      container.addChild(new Spacer(1));
      container.addChild(
        new Markdown(
          String(message.content || "(no output)").trim(),
          0,
          0,
          getMarkdownTheme(),
        ),
      );
      const usageStr = formatResultStats(result);
      if (usageStr) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
      }
      return container;
    },
  );

  pi.registerCommand("subagent", {
    description:
      "Run a Subagent workflow scheme. Usage: /subagent [workflow-id task] or /subagent [legacy agent task]",
    handler: async (args, ctx) => {
      const workflowListing = await listSubagentWorkflows(getAgentDir());
      if (workflowListing.diagnostics.length > 0) {
        ctx.ui.notify(
          `Workflow warnings:\n${workflowListing.diagnostics.join("\n")}`,
          "warning",
        );
      }
      const workflows = workflowListing.workflows.filter(
        (workflow) => workflow.enabled,
      );
      const agentScope: AgentScope = "user";
      const discovery = discoverAgents(ctx.cwd, agentScope);
      const agents = discovery.agents;

      const runWorkflow = async (workflow: SubagentWorkflow, task: string) => {
        ctx.ui.notify(`Running workflow ${workflow.name}...`, "info");
        const result = await runSubagentWorkflow(
          workflow,
          task,
          ctx.cwd,
          agents,
          agentScope,
          discovery.projectAgentsDir,
          ctx.signal,
        );
        pi.sendMessage({
          customType: "subagent-command",
          content: result.output,
          display: true,
          details: result.details,
        });
        ctx.ui.notify(
          `Workflow ${workflow.name} ${result.isError ? "failed" : "completed"}.`,
          result.isError ? "error" : "info",
        );
      };

      if (!args.trim()) {
        if (workflows.length === 0) {
          ctx.ui.notify("No enabled subagent workflows found.", "warning");
          return;
        }
        const labels = workflows.map(
          (workflow) => `${workflow.name} (${workflow.id})`,
        );
        const selected = await ctx.ui.select("选择 Subagent 方案", labels);
        if (!selected) return;
        const workflow = workflows[labels.indexOf(selected)];
        const task = await ctx.ui.input(
          "输入任务",
          "Describe what this workflow should do",
        );
        if (!task?.trim()) {
          ctx.ui.notify("Canceled: task is empty.", "warning");
          return;
        }
        await runWorkflow(workflow, task.trim());
        return;
      }

      const workflowParsed = parseSubagentWorkflowCommandArgs(args);
      if (!("error" in workflowParsed)) {
        const workflow = workflows.find(
          (candidate) => candidate.id === workflowParsed.workflowId,
        );
        if (workflow) {
          await runWorkflow(workflow, workflowParsed.task);
          return;
        }
      }

      const parsed = parseSubagentCommandArgs(args);
      if ("error" in parsed) {
        const available =
          workflows.map((workflow) => workflow.id).join(", ") || "none";
        ctx.ui.notify(
          `${parsed.error}\nAvailable workflows: ${available}`,
          "warning",
        );
        return;
      }

      const selectedAgent = agents.find((agent) => agent.name === parsed.agent);
      ctx.ui.notify(
        `Running legacy subagent ${parsed.agent} with ${parsed.permission} permission...`,
        "info",
      );
      const makeDetails = (results: SingleResult[]): SubagentDetails => ({
        mode: "single",
        agentScope,
        projectAgentsDir: discovery.projectAgentsDir,
        results,
      });

      if (!selectedAgent) {
        ctx.ui.notify(`Unknown agent: ${parsed.agent}`, "error");
        return;
      }

      const result = await runSingleAgent(
        ctx.cwd,
        agents,
        parsed.agent,
        parsed.task,
        parsed.cwd,
        parsed.permission,
        undefined,
        undefined,
        ctx.signal,
        undefined,
        makeDetails,
      );
      const output = limitToolOutput(
        getFinalOutput(result.messages) ||
          result.errorMessage ||
          result.stderr ||
          "(no output)",
      ).text;
      const isError =
        result.exitCode !== 0 ||
        result.stopReason === "error" ||
        result.stopReason === "aborted";
      pi.sendMessage({
        customType: "subagent-command",
        content: output,
        display: true,
        details: makeDetails([result]),
      });
      ctx.ui.notify(
        `Subagent ${parsed.agent} ${isError ? "failed" : "completed"}.`,
        isError ? "error" : "info",
      );
    },
  });
}
