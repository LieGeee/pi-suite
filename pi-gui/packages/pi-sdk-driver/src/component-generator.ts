import { randomUUID } from "node:crypto";
import {
  SessionManager,
  SettingsManager,
  createAgentSession,
  createExtensionRuntime,
  type AuthStorage,
  type CreateAgentSessionOptions,
  type ModelRegistry,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentModelSelection,
  AiChatComponentConfig,
  DevelopmentModeConfig,
  DevelopmentSubagentConfig,
  DevelopmentWorkflowEdge,
  DevelopmentWorkflowNode,
  DockComponentDefinition,
  DockComponentGenerationInput,
  DockComponentKind,
  DockComponentSource,
  ExternalLinkComponentConfig,
} from "./component-manifest.js";
import { messageText as sessionMessageText } from "./session-supervisor-utils.js";

interface ComponentGeneratorDeps {
  readonly agentDir: string;
  readonly authStorage: AuthStorage;
  readonly modelRegistry: ModelRegistry;
}

const COMPONENT_GENERATION_SYSTEM_PROMPT = [
  "You generate JSON manifests for pluggable dock components in a Chinese-first desktop app.",
  "Return exactly one JSON object and nothing else.",
  "Do not use markdown fences, code blocks, comments, or explanatory text.",
  "Use the following schema:",
  "{",
  '  "id": string,',
  '  "label": string,',
  '  "icon": string,',
  '  "kind": "development-mode" | "ai-chat" | "external-link" | "extension-action" | "custom",',
  '  "source": "user" | "extension",',
  '  "description": string,',
  '  "extensionPath"?: string,',
  '  "componentPath"?: string,',
  '  "developmentMode"?: { mainAgent, subagents },',
  '  "aiChat"?: { prompt, environment, provider?, modelId?, thinkingLevel? },',
  '  "externalLink"?: { url, openInNewWindow? },',
  '  "configJson"?: string',
  "}",
  "If you edit an existing component, preserve the id unless the user explicitly asks for a new one.",
  "Prefer concise Chinese labels and descriptions when the user prompt is Chinese.",
].join("\n");

export async function generateDockComponentDefinition(
  input: DockComponentGenerationInput,
  deps: ComponentGeneratorDeps,
): Promise<DockComponentDefinition | null> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return null;
  }

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const resourceLoader = createComponentGenerationResourceLoader();

  const createOptions: CreateAgentSessionOptions = {
    cwd: deps.agentDir,
    agentDir: deps.agentDir,
    authStorage: deps.authStorage,
    modelRegistry: deps.modelRegistry,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(),
    tools: [],
  };
  if (input.model) {
    const selectedModel = deps.modelRegistry.find(input.model.provider, input.model.modelId);
    if (!selectedModel) {
      return null;
    }
    createOptions.model = selectedModel;
  }
  if (input.thinkingLevel) {
    createOptions.thinkingLevel = input.thinkingLevel as NonNullable<CreateAgentSessionOptions["thinkingLevel"]>;
  }

  const { session } = await createAgentSession(createOptions);
  const handleAbort = () => {
    void session.abort().catch(() => undefined);
  };

  try {
    if (!session.model) {
      return null;
    }
    const auth = await session.modelRegistry.getApiKeyAndHeaders(session.model);
    if (!auth.ok || !auth.apiKey) {
      return null;
    }

    const promptText = buildComponentGenerationPrompt(input);
    await session.prompt(promptText, { source: "interactive" });
    const assistantText = extractLastAssistantText(session);
    const parsed = parseGeneratedDockComponentDefinition(assistantText);
    return normalizeDockComponentDefinition(parsed, input.existingDefinition);
  } finally {
    handleAbort();
    session.dispose();
  }
}

function createComponentGenerationResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => COMPONENT_GENERATION_SYSTEM_PROMPT,
    getAppendSystemPrompt: () => [],
    extendResources: () => undefined,
    reload: async () => undefined,
  };
}

function buildComponentGenerationPrompt(input: DockComponentGenerationInput): string {
  const sections = [
    "Generate a dock component manifest that matches the user's request.",
    "Return only JSON.",
    "",
    "<user_request>",
    input.prompt.trim(),
    "</user_request>",
  ];

  if (input.existingDefinition) {
    sections.push(
      "",
      "<existing_component>",
      JSON.stringify(input.existingDefinition, null, 2),
      "</existing_component>",
    );
  }

  return sections.join("\n");
}

function parseGeneratedDockComponentDefinition(text: string): Record<string, unknown> {
  const jsonText = extractJsonText(text);
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Generated component payload must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse generated component JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function extractLastAssistantText(session: { readonly messages: readonly unknown[] }): string {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (!isRecord(message) || message.role !== "assistant") {
      continue;
    }
    return sessionMessageText(message);
  }
  return "";
}

function normalizeDockComponentDefinition(
  parsed: Record<string, unknown>,
  existingDefinition?: DockComponentDefinition,
): DockComponentDefinition {
  const kind = isDockComponentKind(parsed.kind) ? parsed.kind : existingDefinition?.kind ?? "custom";
  const label = trimText(parsed.label) || existingDefinition?.label || defaultLabelForKind(kind);
  const icon = trimText(parsed.icon) || existingDefinition?.icon || defaultIconForKind(kind);
  const description = trimText(parsed.description) || existingDefinition?.description || defaultDescriptionForKind(kind);
  const source = isDockComponentSource(parsed.source) ? parsed.source : existingDefinition?.source ?? "user";
  const id = trimText(parsed.id) || existingDefinition?.id || createComponentId(label, kind);

  return {
    id,
    label,
    icon,
    kind,
    source,
    description,
    ...(typeof parsed.extensionPath === "string" ? { extensionPath: parsed.extensionPath } : existingDefinition?.extensionPath ? { extensionPath: existingDefinition.extensionPath } : {}),
    ...(typeof parsed.componentPath === "string" ? { componentPath: parsed.componentPath } : existingDefinition?.componentPath ? { componentPath: existingDefinition.componentPath } : {}),
    ...(kind === "development-mode"
      ? { developmentMode: normalizeDevelopmentModeConfig(parsed.developmentMode, existingDefinition?.developmentMode) }
      : existingDefinition?.developmentMode && existingDefinition.kind === "development-mode"
        ? {}
        : typeof parsed.developmentMode === "object" && parsed.developmentMode !== null
          ? { developmentMode: normalizeDevelopmentModeConfig(parsed.developmentMode, existingDefinition?.developmentMode) }
          : existingDefinition?.developmentMode && existingDefinition.kind === kind
            ? { developmentMode: existingDefinition.developmentMode }
            : {}),
    ...(kind === "ai-chat"
      ? { aiChat: normalizeAiChatConfig(parsed.aiChat, existingDefinition?.aiChat) }
      : typeof parsed.aiChat === "object" && parsed.aiChat !== null
        ? { aiChat: normalizeAiChatConfig(parsed.aiChat, existingDefinition?.aiChat) }
        : existingDefinition?.aiChat && existingDefinition.kind === kind
          ? { aiChat: existingDefinition.aiChat }
          : {}),
    ...(kind === "external-link"
      ? { externalLink: normalizeExternalLinkConfig(parsed.externalLink, existingDefinition?.externalLink) }
      : typeof parsed.externalLink === "object" && parsed.externalLink !== null
        ? { externalLink: normalizeExternalLinkConfig(parsed.externalLink, existingDefinition?.externalLink) }
        : existingDefinition?.externalLink && existingDefinition.kind === kind
          ? { externalLink: existingDefinition.externalLink }
          : {}),
    ...(typeof parsed.configJson === "string"
      ? { configJson: parsed.configJson }
      : existingDefinition?.configJson
        ? { configJson: existingDefinition.configJson }
        : {}),
  };
}

function normalizeDevelopmentModeConfig(
  value: unknown,
  fallback?: DevelopmentModeConfig,
): DevelopmentModeConfig {
  if (!isRecord(value)) {
    return fallback ?? {
      mainAgent: { provider: "", modelId: "", thinkingLevel: "medium" },
      subagents: [],
    };
  }

  const documentContext = normalizeDevelopmentDocumentContext(value.documentContext, fallback?.documentContext);
  const toolContext = normalizeDevelopmentToolContext(value.toolContext, fallback?.toolContext);
  const graph = normalizeDevelopmentWorkflowGraph(value.graph, fallback?.graph);
  return {
    workflow: normalizeDevelopmentWorkflow(value.workflow, fallback?.workflow),
    environment: value.environment === "worktree" ? "worktree" : fallback?.environment ?? "local",
    subagentLaunchPolicy: normalizeSubagentLaunchPolicy(value.subagentLaunchPolicy, fallback?.subagentLaunchPolicy),
    mainAgent: normalizeAgentModelSelection(value.mainAgent, fallback?.mainAgent),
    subagents: Array.isArray(value.subagents)
      ? value.subagents
          .filter(isRecord)
          .map((entry, index) => normalizeDevelopmentSubagent(entry, fallback?.subagents[index]))
      : fallback?.subagents ?? [],
    ...(documentContext ? { documentContext } : {}),
    ...(toolContext ? { toolContext } : {}),
    ...(graph ? { graph } : {}),
  };
}

function normalizeAiChatConfig(value: unknown, fallback?: AiChatComponentConfig): AiChatComponentConfig {
  if (!isRecord(value)) {
    return fallback ?? {
      prompt: "",
      environment: "local",
    };
  }

  return {
    prompt: trimText(value.prompt) || fallback?.prompt || "",
    environment: value.environment === "worktree" ? "worktree" : "local",
    ...(typeof value.provider === "string" ? { provider: value.provider } : fallback?.provider ? { provider: fallback.provider } : {}),
    ...(typeof value.modelId === "string" ? { modelId: value.modelId } : fallback?.modelId ? { modelId: fallback.modelId } : {}),
    ...(typeof value.thinkingLevel === "string"
      ? { thinkingLevel: value.thinkingLevel }
      : fallback?.thinkingLevel
        ? { thinkingLevel: fallback.thinkingLevel }
        : {}),
  };
}

function normalizeExternalLinkConfig(value: unknown, fallback?: ExternalLinkComponentConfig): ExternalLinkComponentConfig {
  if (!isRecord(value)) {
    return fallback ?? {
      url: "",
    };
  }

  return {
    url: trimText(value.url) || fallback?.url || "",
    ...(typeof value.openInNewWindow === "boolean"
      ? { openInNewWindow: value.openInNewWindow }
      : fallback?.openInNewWindow !== undefined
        ? { openInNewWindow: fallback.openInNewWindow }
        : {}),
  };
}

function normalizeAgentModelSelection(value: unknown, fallback?: AgentModelSelection): AgentModelSelection {
  if (!isRecord(value)) {
    return fallback ?? { provider: "", modelId: "", thinkingLevel: "medium" };
  }

  return {
    provider: typeof value.provider === "string" ? value.provider : fallback?.provider ?? "",
    modelId: typeof value.modelId === "string" ? value.modelId : fallback?.modelId ?? "",
    ...(typeof value.thinkingLevel === "string"
      ? { thinkingLevel: value.thinkingLevel }
      : fallback?.thinkingLevel
        ? { thinkingLevel: fallback.thinkingLevel }
        : {}),
  };
}

function normalizeSubagentLaunchPolicy(
  value: unknown,
  fallback?: DevelopmentModeConfig["subagentLaunchPolicy"],
): NonNullable<DevelopmentModeConfig["subagentLaunchPolicy"]> {
  return value === "manual" || value === "every-message" || value === "first-message"
    ? value
    : fallback ?? "first-message";
}

function normalizeDevelopmentWorkflow(
  value: unknown,
  fallback?: DevelopmentModeConfig["workflow"],
): NonNullable<DevelopmentModeConfig["workflow"]> {
  return value === "parallel-development" ||
    value === "proposal-review" ||
    value === "code-review" ||
    value === "test-fix" ||
    value === "manual"
    ? value
    : fallback ?? "manual";
}

function normalizeDevelopmentDocumentContext(
  value: unknown,
  fallback?: DevelopmentModeConfig["documentContext"],
): DevelopmentModeConfig["documentContext"] {
  if (!isRecord(value)) {
    return fallback;
  }
  const paths = Array.isArray(value.paths)
    ? value.paths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : fallback?.paths ?? [];
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback?.enabled ?? paths.length > 0,
    paths,
    shareWithSubagents: typeof value.shareWithSubagents === "boolean" ? value.shareWithSubagents : fallback?.shareWithSubagents ?? true,
  };
}

function normalizeDevelopmentWorkflowGraph(
  value: unknown,
  fallback?: DevelopmentModeConfig["graph"],
): DevelopmentModeConfig["graph"] {
  if (!isRecord(value)) {
    return fallback;
  }
  const nodes: readonly DevelopmentWorkflowNode[] = Array.isArray(value.nodes)
    ? value.nodes
        .filter(isRecord)
        .map((node): DevelopmentWorkflowNode => {
          const role = normalizeDevelopmentSubagentRole(node.role);
          const permission = normalizeDevelopmentNodePermission(node.permission);
          return {
            id: typeof node.id === "string" && node.id.trim() ? node.id.trim() : randomUUID(),
            kind: normalizeWorkflowNodeKind(node.kind),
            label: typeof node.label === "string" && node.label.trim() ? node.label.trim() : "节点",
            ...(role ? { role } : {}),
            ...(isRecord(node.model) ? { model: normalizeAgentModelSelection(node.model) } : {}),
            ...(permission ? { permission } : {}),
            ...(typeof node.description === "string" && node.description.trim() ? { description: node.description.trim() } : {}),
          };
        })
    : fallback?.nodes ?? [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: readonly DevelopmentWorkflowEdge[] = Array.isArray(value.edges)
    ? value.edges
        .filter(isRecord)
        .map((edge) => ({
          from: typeof edge.from === "string" ? edge.from.trim() : "",
          to: typeof edge.to === "string" ? edge.to.trim() : "",
          ...(typeof edge.label === "string" && edge.label.trim() ? { label: edge.label.trim() } : {}),
          ...(typeof edge.loopCount === "number" && edge.loopCount > 1 ? { loopCount: edge.loopCount } : {}),
        }))
        .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    : fallback?.edges ?? [];
  return nodes.length > 0 ? { nodes, edges } : fallback;
}

function normalizeWorkflowNodeKind(value: unknown): NonNullable<DevelopmentModeConfig["graph"]>["nodes"][number]["kind"] {
  switch (value) {
    case "docs":
    case "tools":
    case "worktree":
    case "agent":
    case "summary":
      return value;
    case "input":
    default:
      return "input";
  }
}

function normalizeDevelopmentNodePermission(value: unknown): DevelopmentWorkflowNode["permission"] {
  return value === "exec" || value === "write" || value === "read" ? value : undefined;
}

function normalizeDevelopmentToolContext(
  value: unknown,
  fallback?: DevelopmentModeConfig["toolContext"],
): DevelopmentModeConfig["toolContext"] {
  if (!isRecord(value)) {
    return fallback;
  }
  const enabledExtensionPaths = Array.isArray(value.enabledExtensionPaths)
    ? value.enabledExtensionPaths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : fallback?.enabledExtensionPaths ?? [];
  return enabledExtensionPaths.length > 0
    ? {
        enabled: typeof value.enabled === "boolean" ? value.enabled : fallback?.enabled ?? true,
        enabledExtensionPaths,
      }
    : fallback;
}

function normalizeDevelopmentSubagent(
  value: Record<string, unknown>,
  fallback?: DevelopmentSubagentConfig,
): DevelopmentSubagentConfig {
  const role = normalizeDevelopmentSubagentRole(value.role, fallback?.role);
  return {
    id: typeof value.id === "string" ? value.id : fallback?.id ?? createComponentId(typeof value.name === "string" ? value.name : "subagent", "custom"),
    name: typeof value.name === "string" ? value.name : fallback?.name ?? "",
    ...(role ? { role } : {}),
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback?.enabled ?? true,
    model: normalizeAgentModelSelection(value.model, fallback?.model),
    permission: value.permission === "exec" || value.permission === "write" ? value.permission : "read",
    trigger: value.trigger === "after-implementation" || value.trigger === "test-failure" ? value.trigger : "manual",
  };
}

function normalizeDevelopmentSubagentRole(
  value: unknown,
  fallback?: DevelopmentSubagentConfig["role"],
): DevelopmentSubagentConfig["role"] {
  return value === "architect" ||
    value === "developer" ||
    value === "tester" ||
    value === "reviewer" ||
    value === "fixer" ||
    value === "observer"
    ? value
    : fallback;
}

function defaultLabelForKind(kind: DockComponentKind): string {
  switch (kind) {
    case "development-mode":
      return "开发模式";
    case "ai-chat":
      return "AI 对话";
    case "external-link":
      return "外部链接";
    case "extension-action":
      return "扩展动作";
    case "custom":
      return "自定义组件";
  }
}

function defaultIconForKind(kind: DockComponentKind): string {
  switch (kind) {
    case "development-mode":
      return "🛠️";
    case "ai-chat":
      return "🤖";
    case "external-link":
      return "🔗";
    case "extension-action":
      return "⚡";
    case "custom":
      return "🧩";
  }
}

function defaultDescriptionForKind(kind: DockComponentKind): string {
  switch (kind) {
    case "development-mode":
      return "主 Agent 和子 Agent 的开发配置。";
    case "ai-chat":
      return "可直接打开对话的新线程组件。";
    case "external-link":
      return "打开外部链接的 Dock 组件。";
    case "extension-action":
      return "执行扩展命令或动作的组件。";
    case "custom":
      return "用户自定义的可插拔 Dock 组件。";
  }
}

function createComponentId(label: string, kind: DockComponentKind): string {
  const normalized = `${kind}-${label}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `${kind}-${randomUUID().slice(0, 8)}`;
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDockComponentKind(value: unknown): value is DockComponentKind {
  return (
    value === "development-mode" ||
    value === "ai-chat" ||
    value === "external-link" ||
    value === "extension-action" ||
    value === "custom"
  );
}

function isDockComponentSource(value: unknown): value is DockComponentSource {
  return value === "user" || value === "extension";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
