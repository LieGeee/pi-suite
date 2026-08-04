import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  formatMissingCodeGraphMessage,
  formatNotInitializedMessage,
  hasCodeGraphIndex,
  normalizeCwd,
  runCodeGraph,
} from "./cli.js";
import { callCodeGraphMcpTool } from "./mcp.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 50_000;

type JsonSchema = Record<string, unknown>;

const BaseProperties: Record<string, JsonSchema> = {
  cwd: { type: "string", description: "Project directory. Defaults to current pi cwd." },
  allowNpx: { type: "boolean", description: "Allow npx -y @colbymchenry/codegraph when codegraph is not on PATH. Default false." },
  timeoutMs: { type: "number", description: "Command timeout in milliseconds. Default 60000." },
  maxOutputBytes: { type: "number", description: "Maximum stdout/stderr bytes returned. Default 50000." },
};

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return { type: "object", properties: { ...BaseProperties, ...properties }, required, additionalProperties: false };
}

const StatusParams = objectSchema({});
const ContextParams = objectSchema({
  task: { type: "string", description: "Task, feature, bug, or area to build CodeGraph context for." },
  maxNodes: { type: "number", description: "Maximum nodes in generated context." },
  format: { enum: ["markdown", "json"], description: "Output format." },
}, ["task"]);
const SearchParams = objectSchema({
  query: { type: "string", description: "Symbol/name/full-text query." },
  kind: { type: "string", description: "Optional symbol kind filter." },
  limit: { type: "number", description: "Maximum results." },
  json: { type: "boolean", description: "Return CodeGraph JSON output. Default true." },
}, ["query"]);
const SymbolParams = objectSchema({
  symbol: { type: "string", description: "Symbol id or name to inspect." },
  limit: { type: "number", description: "Maximum results for callers/callees." },
  depth: { type: "number", description: "Depth for impact analysis." },
  json: { type: "boolean", description: "Return CodeGraph JSON output. Default true." },
}, ["symbol"]);
const FilesParams = objectSchema({
  filter: { type: "string", description: "Optional file filter." },
  maxDepth: { type: "number", description: "Maximum file tree depth." },
  json: { type: "boolean", description: "Return CodeGraph JSON output. Default true." },
});
const AffectedParams = objectSchema({
  files: { type: "array", items: { type: "string" }, description: "Changed files. If omitted, CodeGraph decides from cwd/default behavior." },
  filter: { type: "string", description: "Optional test file filter." },
  quiet: { type: "boolean", description: "Pass --quiet." },
});
const NodeParams = objectSchema({
  symbol: { type: "string", description: "Symbol name to get details for." },
  includeCode: { type: "boolean", description: "Include full source code. Default false." },
  projectPath: { type: "string", description: "Optional different initialized project path." },
}, ["symbol"]);
const ExploreParams = objectSchema({
  query: { type: "string", description: "Symbol names, file names, or short code terms to explore." },
  maxFiles: { type: "number", description: "Maximum files to include. Default 12." },
  projectPath: { type: "string", description: "Optional different initialized project path." },
}, ["query"]);
const TraceParams = objectSchema({
  from: { type: "string", description: "Symbol where the flow starts." },
  to: { type: "string", description: "Symbol the flow should reach." },
  projectPath: { type: "string", description: "Optional different initialized project path." },
}, ["from", "to"]);

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
};

type CommonParams = {
  cwd?: string;
  allowNpx?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export default function codeGraphExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "codegraph_status",
    label: "CodeGraph Status",
    description: "Show CodeGraph status for the current project and whether .codegraph exists.",
    parameters: StatusParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => runTool(ctx.cwd, params, ["status"], signal, { requireIndex: false }),
  });

  pi.registerTool({
    name: "codegraph_context",
    label: "CodeGraph Context",
    description: "Build relevant code context for a task/feature/bug using CodeGraph.",
    parameters: ContextParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["context", params.task];
      if (params.format) args.push("--format", params.format);
      if (params.maxNodes) args.push("--max-nodes", String(params.maxNodes));
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_search",
    label: "CodeGraph Search",
    description: "Search symbols by name/query using CodeGraph.",
    parameters: SearchParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["query", params.query];
      if (params.kind) args.push("--kind", params.kind);
      if (params.limit) args.push("--limit", String(params.limit));
      if (params.json !== false) args.push("--json");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_callers",
    label: "CodeGraph Callers",
    description: "Find what calls a symbol using CodeGraph.",
    parameters: SymbolParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["callers", params.symbol];
      if (params.limit) args.push("--limit", String(params.limit));
      if (params.json !== false) args.push("--json");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_callees",
    label: "CodeGraph Callees",
    description: "Find what a symbol calls using CodeGraph.",
    parameters: SymbolParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["callees", params.symbol];
      if (params.limit) args.push("--limit", String(params.limit));
      if (params.json !== false) args.push("--json");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_impact",
    label: "CodeGraph Impact",
    description: "Analyze what code is affected by changing a symbol using CodeGraph.",
    parameters: SymbolParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["impact", params.symbol];
      if (params.depth) args.push("--depth", String(params.depth));
      if (params.json !== false) args.push("--json");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_files",
    label: "CodeGraph Files",
    description: "Show indexed file structure using CodeGraph.",
    parameters: FilesParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["files"];
      if (params.filter) args.push("--filter", params.filter);
      if (params.maxDepth) args.push("--max-depth", String(params.maxDepth));
      if (params.json !== false) args.push("--json");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_affected",
    label: "CodeGraph Affected Tests",
    description: "Find test files affected by changed source files using CodeGraph.",
    parameters: AffectedParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = ["affected", ...(params.files ?? [])];
      if (params.filter) args.push("--filter", params.filter);
      if (params.quiet) args.push("--quiet");
      return runTool(ctx.cwd, params, args, signal);
    },
  });

  pi.registerTool({
    name: "codegraph_node",
    label: "CodeGraph Node",
    description: "MCP bridge: get one symbol's details, trail, and optionally source code.",
    parameters: NodeParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => runMcpTool(ctx.cwd, params, "codegraph_node", {
      symbol: params.symbol,
      includeCode: params.includeCode ?? false,
      ...(params.projectPath ? { projectPath: params.projectPath } : {}),
    }, signal),
  });

  pi.registerTool({
    name: "codegraph_explore",
    label: "CodeGraph Explore",
    description: "MCP bridge: return source for several related symbols grouped by file plus relationships.",
    parameters: ExploreParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => runMcpTool(ctx.cwd, params, "codegraph_explore", {
      query: params.query,
      ...(params.maxFiles ? { maxFiles: params.maxFiles } : {}),
      ...(params.projectPath ? { projectPath: params.projectPath } : {}),
    }, signal),
  });

  pi.registerTool({
    name: "codegraph_trace",
    label: "CodeGraph Trace",
    description: "MCP bridge: trace the call path between two symbols.",
    parameters: TraceParams,
    execute: async (_id, params, signal, _onUpdate, ctx) => runMcpTool(ctx.cwd, params, "codegraph_trace", {
      from: params.from,
      to: params.to,
      ...(params.projectPath ? { projectPath: params.projectPath } : {}),
    }, signal),
  });

  pi.registerCommand("codegraph", {
    description: "Show CodeGraph integration status and usage hints",
    handler: async (args, ctx) => {
      const cwd = normalizeCwd(args.trim() || undefined, ctx.cwd);
      const index = hasCodeGraphIndex(cwd) ? "present" : "missing";
      ctx.ui.notify(`CodeGraph cwd=${cwd}; .codegraph=${index}`, index === "present" ? "success" : "warning");
    },
  });

  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: `${event.systemPrompt}\n\nCodeGraph integration: when the current project has .codegraph/ and the task is about code architecture, symbol lookup, call flow, impact analysis, or locating implementation, prefer codegraph_* tools before broad grep/read exploration. If .codegraph/ is missing, do not initialize automatically; ask before running codegraph init -i.`,
    };
  });
}

async function runMcpTool(
  fallbackCwd: string,
  params: CommonParams,
  toolName: string,
  toolArguments: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  const cwd = normalizeCwd(params.cwd, fallbackCwd);
  if (!hasCodeGraphIndex(cwd)) {
    return {
      content: [{ type: "text", text: formatNotInitializedMessage(cwd) }],
      details: { cwd, toolName, arguments: toolArguments, initialized: false },
      isError: true,
    };
  }

  try {
    const result = await callCodeGraphMcpTool({
      cwd,
      toolName,
      arguments: toolArguments,
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputBytes: params.maxOutputBytes ?? 80_000,
      signal,
    });
    return {
      content: [{ type: "text", text: result.text || "(CodeGraph MCP returned no text)" }],
      details: result as unknown as Record<string, unknown>,
      isError: result.timedOut,
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      details: { cwd, toolName, arguments: toolArguments },
      isError: true,
    };
  }
}

async function runTool(
  fallbackCwd: string,
  params: CommonParams,
  args: string[],
  signal: AbortSignal | undefined,
  options: { requireIndex?: boolean } = {},
): Promise<ToolResult> {
  const cwd = normalizeCwd(params.cwd, fallbackCwd);
  const requireIndex = options.requireIndex ?? true;
  if (requireIndex && !hasCodeGraphIndex(cwd)) {
    return {
      content: [{ type: "text", text: formatNotInitializedMessage(cwd) }],
      details: { cwd, args, initialized: false },
      isError: true,
    };
  }

  const result = await runCodeGraph({
    cwd,
    args,
    allowNpx: params.allowNpx,
    timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputBytes: params.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    signal,
  });

  if (result.exitCode === null && /ENOENT|not found|spawn .* ENOENT/i.test(result.stderr)) {
    return {
      content: [{ type: "text", text: formatMissingCodeGraphMessage(cwd) }],
      details: result as unknown as Record<string, unknown>,
      isError: true,
    };
  }

  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n\n--- stderr ---\n");
  return {
    content: [{ type: "text", text: output || `(codegraph exited ${result.exitCode ?? "unknown"} with no output)` }],
    details: result as unknown as Record<string, unknown>,
    isError: result.exitCode !== 0 || result.timedOut,
  };
}
