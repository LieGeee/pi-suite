import type { SessionConfig } from "@pi-gui/session-driver";
import type {
  RuntimeCommandRecord,
  RuntimeProviderRecord,
  RuntimeSettingsSnapshot,
  RuntimeSnapshot,
} from "@pi-gui/session-driver/runtime-types";
import type { ExtensionCommandCompatibilityRecord } from "./desktop-state";
import { titleCase } from "./string-utils";

export type ComposerSlashCommandKind =
  | "runtime"
  | "model"
  | "thinking"
  | "tree"
  | "status"
  | "session"
  | "reload"
  | "compact"
  | "name"
  | "login"
  | "logout"
  | "settings"
  | "scoped-models";

export interface ComposerSlashCommand {
  readonly id: string;
  readonly kind: ComposerSlashCommandKind;
  readonly command: string;
  readonly template: string;
  readonly title: string;
  readonly description: string;
  readonly submitMode?: "immediate" | "prefill" | "pick-option";
  readonly section: "runtime" | "host";
  readonly runtimeCommand?: RuntimeCommandRecord;
  readonly sourceLabel?: string;
  readonly compatibility?: ExtensionCommandCompatibilityRecord;
}

export interface ComposerSlashCommandSection {
  readonly id: "runtime" | "host";
  readonly title?: string;
  readonly items: readonly ComposerSlashCommand[];
}

export interface ComposerSlashOption {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

export interface ComposerSlashOptionEmptyState {
  readonly title: string;
  readonly description: string;
}

export interface ComposerModelOption extends ComposerSlashOption {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ComposerProviderOption extends ComposerSlashOption {
  readonly providerId: string;
}

export const MODEL_OPTIONS_EMPTY_TITLE = "没有可用模型";
export const MODEL_OPTIONS_EMPTY_DESCRIPTION = "请打开设置启用模型，或先登录一个提供商。";

export type ParsedComposerCommand =
  | { type: "model"; provider: string; modelId: string }
  | { type: "thinking"; thinkingLevel: string }
  | { type: "tree" }
  | { type: "status" }
  | { type: "session" }
  | { type: "reload" }
  | { type: "compact"; customInstructions?: string }
  | { type: "name"; title: string };

const INCOMPLETE_COMMAND_MESSAGES: Readonly<Record<string, string>> = {
  "/compact": "可以在 /compact 后面补充说明，或者直接在斜杠菜单里发送。",
  "/login": "先在斜杠菜单里选择提供商，再发送 /login。",
  "/logout": "先在斜杠菜单里选择一个已连接的提供商，再发送 /logout。",
  "/model": "先在斜杠菜单里选择提供商和模型，再发送 /model。",
  "/name": "请在 /name 后面补上对话标题。",
  "/scoped-models": "可以从斜杠菜单或设置页打开“已启用模型”。",
  "/settings": "可以通过斜杠菜单或设置快捷键打开。",
  "/thinking": "先在斜杠菜单里选择推理强度，再发送 /thinking。",
} as const;

const HOST_ACTION_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  {
    id: "host:model",
    kind: "model",
    command: "/model",
    template: "/model",
    title: "模型",
    description: "为当前会话选择模型",
    submitMode: "pick-option",
    section: "host",
  },
  {
    id: "host:thinking",
    kind: "thinking",
    command: "/thinking",
    template: "/thinking",
    title: "推理强度",
    description: "设置当前会话的推理强度",
    submitMode: "pick-option",
    section: "host",
  },
  {
    id: "host:tree",
    kind: "tree",
    command: "/tree",
    template: "/tree",
    title: "会话树",
    description: "浏览并跳转当前会话的分支",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:status",
    kind: "status",
    command: "/status",
    template: "/status",
    title: "状态",
    description: "在时间线中显示当前会话覆盖状态",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:login",
    kind: "login",
    command: "/login",
    template: "/login",
    title: "登录",
    description: "为当前工作区认证提供商",
    submitMode: "pick-option",
    section: "host",
  },
  {
    id: "host:logout",
    kind: "logout",
    command: "/logout",
    template: "/logout",
    title: "退出登录",
    description: "移除当前工作区的提供商登录",
    submitMode: "pick-option",
    section: "host",
  },
  {
    id: "host:settings",
    kind: "settings",
    command: "/settings",
    template: "/settings",
    title: "设置",
    description: "打开模型、技能和通知设置",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:scoped-models",
    kind: "scoped-models",
    command: "/scoped-models",
    template: "/scoped-models",
    title: "已启用模型",
    description: "选择哪些模型会出现在选择器中",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:session",
    kind: "session",
    command: "/session",
    template: "/session",
    title: "当前会话",
    description: "在时间线中显示当前会话详情",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:name",
    kind: "name",
    command: "/name",
    template: "/name 新对话标题",
    title: "重命名",
    description: "重命名当前会话",
    submitMode: "prefill",
    section: "host",
  },
  {
    id: "host:compact",
    kind: "compact",
    command: "/compact",
    template: "/compact",
    title: "压缩上下文",
    description: "立即压缩当前会话上下文",
    submitMode: "immediate",
    section: "host",
  },
  {
    id: "host:reload",
    kind: "reload",
    command: "/reload",
    template: "/reload",
    title: "重新加载",
    description: "重新加载提示词、技能和会话资源",
    submitMode: "immediate",
    section: "host",
  },
] as const;

export const THINKING_OPTIONS: readonly ComposerSlashOption[] = [
  {
    value: "low",
    label: "低",
    description: "响应更快，推理较轻",
  },
  {
    value: "medium",
    label: "中",
    description: "兼顾速度与推理深度，适合日常任务",
  },
  {
    value: "high",
    label: "高",
    description: "为复杂问题提供更强推理能力",
  },
  {
    value: "xhigh",
    label: "超高",
    description: "为复杂问题提供最高级别推理深度",
  },
] as const;

export function buildSlashCommandSections(
  query: string,
  runtime: RuntimeSnapshot | undefined,
  sessionCommands: readonly RuntimeCommandRecord[],
  compatibilityRecords: readonly ExtensionCommandCompatibilityRecord[] = [],
  options: {
    readonly allowTreeCommand?: boolean;
  } = {},
): readonly ComposerSlashCommandSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const availableRuntimeCommands = resolveRuntimeCommands(runtime, sessionCommands);
  const compatibilityByKey = new Map(
    compatibilityRecords.map((record) => [`${record.extensionPath}::${record.commandName}`, record] as const),
  );
  const runtimeMatches = availableRuntimeCommands
    .map<ComposerSlashCommand>((command) => ({
      id: `runtime:${command.source}:${command.name}`,
      kind: "runtime",
      command: `/${command.name}`,
      template: `/${command.name} `,
      title: formatRuntimeCommandTitle(command),
      description: formatRuntimeCommandDescription(command),
      submitMode: "prefill",
      section: "runtime",
      runtimeCommand: command,
      sourceLabel: formatRuntimeSourceLabel(command),
      compatibility: compatibilityByKey.get(`${command.sourceInfo.path}::${command.name}`),
    }))
    .filter((command) => matchesCommand(command, normalizedQuery));
  const allowTreeCommand = options.allowTreeCommand ?? true;
  const hostMatches = HOST_ACTION_SLASH_COMMANDS.filter(
    (command) => (allowTreeCommand || command.kind !== "tree") && matchesCommand(command, normalizedQuery),
  );

  const sections: ComposerSlashCommandSection[] = [
    {
      id: "runtime",
      title: runtimeMatches.length > 0 ? "运行时命令" : undefined,
      items: runtimeMatches,
    },
    {
      id: "host",
      title: hostMatches.length > 0 ? "界面操作" : undefined,
      items: hostMatches,
  },
];

  return sections.filter((section) => section.items.length > 0);
}

export function resolveRuntimeCommands(
  runtime: RuntimeSnapshot | undefined,
  sessionCommands: readonly RuntimeCommandRecord[],
): readonly RuntimeCommandRecord[] {
  if (!runtime) {
    return sessionCommands;
  }

  const baseCommands = runtime.settings.enableSkillCommands
    ? sessionCommands
    : sessionCommands.filter((command) => command.source !== "skill");
  if (!runtime.settings.enableSkillCommands) {
    return baseCommands;
  }

  const merged = [...baseCommands];
  const seenNames = new Set(baseCommands.map((command) => command.name));
  for (const skill of runtime.skills) {
    if (!skill.enabled) {
      continue;
    }

    const commandName = normalizeRuntimeCommandName(skill.slashCommand);
    if (seenNames.has(commandName)) {
      continue;
    }

    seenNames.add(commandName);
    merged.push({
      name: commandName,
      description: skill.description,
      source: "skill",
      sourceInfo: {
        path: skill.filePath,
        source: skill.source,
        scope: skill.filePath.startsWith(runtime.workspace.path) ? "project" : "user",
        origin: "top-level",
        baseDir: skill.baseDir,
      },
    });
  }

  return merged;
}

export function hasRuntimeSlashCommand(
  text: string,
  runtime: RuntimeSnapshot | undefined,
  sessionCommands: readonly RuntimeCommandRecord[],
): boolean {
  return Boolean(resolveRuntimeSlashCommand(text, runtime, sessionCommands));
}

export function resolveRuntimeSlashCommand(
  text: string,
  runtime: RuntimeSnapshot | undefined,
  sessionCommands: readonly RuntimeCommandRecord[],
): RuntimeCommandRecord | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const spaceIndex = trimmed.indexOf(" ");
  const commandName = normalizeRuntimeCommandName(spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex));
  return resolveRuntimeCommands(runtime, sessionCommands).find((command) => command.name === commandName);
}

function normalizeRuntimeCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

export function flattenSlashSections(
  sections: readonly ComposerSlashCommandSection[],
): readonly ComposerSlashCommand[] {
  return sections.flatMap((section) => section.items);
}

export function buildProviderOptions(
  providers: readonly RuntimeProviderRecord[],
  filter: (provider: RuntimeProviderRecord) => boolean = () => true,
): readonly ComposerProviderOption[] {
  return providers
    .filter(filter)
    .sort(compareProviders)
    .map((provider) => ({
      value: provider.id,
      label: provider.name,
      description: describeProvider(provider),
      providerId: provider.id,
    }));
}

export function buildModelOptions(
  runtime: RuntimeSnapshot | undefined,
): readonly ComposerModelOption[] {
  if (!runtime) {
    return [];
  }

  const enabledPatterns = runtime.settings.enabledModelPatterns;
  const allAvailable = enabledPatterns.length === 0;
  const enabledSet = allAvailable ? undefined : new Set(enabledPatterns);

  return [...runtime.models]
    .filter((model) => {
      if (!model.available) return false;
      if (!enabledSet) return true;
      return enabledSet.has(`${model.providerId}/${model.modelId}`);
    })
    .sort((left: RuntimeSnapshot["models"][number], right: RuntimeSnapshot["models"][number]) => {
      const providerCompare =
        providerRankForId(runtime.providers, left.providerId) - providerRankForId(runtime.providers, right.providerId);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return `${left.providerName} ${left.label}`.localeCompare(`${right.providerName} ${right.label}`);
    })
    .map((model: RuntimeSnapshot["models"][number]) => ({
      value: model.modelId,
      label: `${model.providerName} · ${model.label}`,
      description: model.modelId,
      providerId: model.providerId,
      modelId: model.modelId,
    }));
}

export function slashOptionsForCommand(
  command: ComposerSlashCommand | undefined,
  runtime?: RuntimeSnapshot,
): readonly ComposerSlashOption[] {
  if (!command) {
    return [];
  }

  if (command.kind === "thinking") {
    return THINKING_OPTIONS;
  }
  if (command.kind === "model") {
    return buildModelOptions(runtime);
  }
  if (command.kind === "login") {
    return buildProviderOptions(runtime?.providers ?? [], (provider) => provider.oauthSupported);
  }
  if (command.kind === "logout") {
    return buildProviderOptions(
      runtime?.providers ?? [],
      (provider) => provider.authSource === "oauth" || provider.authSource === "auth_file",
    );
  }

  return [];
}

export function slashOptionEmptyState(
  command: ComposerSlashCommand | undefined,
  runtime?: RuntimeSnapshot,
): ComposerSlashOptionEmptyState | undefined {
  if (!command) {
    return undefined;
  }

  if (command.kind === "model" && buildModelOptions(runtime).length === 0) {
    return {
      title: MODEL_OPTIONS_EMPTY_TITLE,
      description: MODEL_OPTIONS_EMPTY_DESCRIPTION,
    };
  }

  return undefined;
}

function matchesCommand(command: ComposerSlashCommand, normalizedQuery: string): boolean {
  if (!normalizedQuery.startsWith("/")) {
    return false;
  }

  if (normalizedQuery === "/") {
    return true;
  }

  const queryWithoutSlash = normalizedQuery.replace(/^\/+/, "").trim();
  const rawSearchTerms = [command.command.toLowerCase()];
  const aliasSearchTerms = buildSlashSearchAliases(command);
  if (rawSearchTerms.some((value) => value.includes(normalizedQuery))) {
    return true;
  }

  if (!queryWithoutSlash) {
    return false;
  }

  return aliasSearchTerms.some((value) => value.includes(queryWithoutSlash));
}

function buildSlashSearchAliases(command: ComposerSlashCommand): readonly string[] {
  const aliases = new Set<string>([
    command.command.replace(/^\/+/, "").toLowerCase(),
    command.title.toLowerCase(),
    command.sourceLabel?.toLowerCase() ?? "",
    command.compatibility?.status === "terminal-only" ? "terminal-only" : "",
  ]);

  if (command.runtimeCommand) {
    aliases.add(command.runtimeCommand.name.toLowerCase());
    aliases.add(command.runtimeCommand.name.replace(/^skill:/, "").toLowerCase());
  }

  return [...aliases].filter(Boolean);
}

function describeProvider(provider: RuntimeProviderRecord): string {
  if (provider.authSource === "oauth") {
    return "OAuth 已连接";
  }
  if (provider.authSource === "auth_file") {
    return "已保存 API 密钥";
  }
  if (provider.authSource === "env") {
    return "通过环境变量配置";
  }
  if (provider.authSource === "external") {
    return "由外部完成配置";
  }
  if (provider.oauthSupported) {
    return "支持 OAuth";
  }
  if (provider.apiKeySetupSupported) {
    return "需要 API 密钥";
  }
  return "可用";
}

function compareProviders(left: RuntimeProviderRecord, right: RuntimeProviderRecord): number {
  const leftRank = providerRank(left);
  const rightRank = providerRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.name.localeCompare(right.name);
}

function providerRank(provider: RuntimeProviderRecord): number {
  if (provider.hasAuth) {
    return 0;
  }
  if (provider.id === "openai-codex" || provider.id === "anthropic") {
    return 1;
  }
  if (provider.oauthSupported) {
    return 2;
  }
  return 3;
}

function providerRankForId(
  providers: readonly RuntimeProviderRecord[],
  providerId: string,
): number {
  const provider = providers.find((entry) => entry.id === providerId);
  return provider ? providerRank(provider) : 99;
}

function summarizeSkillDescription(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "可复用工作流";
  }

  const firstSentence = trimmed.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? trimmed;
  return firstSentence.length > 96 ? `${firstSentence.slice(0, 93).trimEnd()}...` : firstSentence;
}

function formatRuntimeCommandTitle(command: RuntimeCommandRecord): string {
  if (command.source === "skill" && command.name.startsWith("skill:")) {
    return titleCase(command.name.slice("skill:".length));
  }
  return titleCase(command.name.replace(/[:_-]+/g, " "));
}

function formatRuntimeCommandDescription(command: RuntimeCommandRecord): string {
  if (command.description?.trim()) {
    return command.description.trim();
  }
  if (command.source === "prompt") {
    return "提示词模板";
  }
  if (command.source === "skill") {
    return "技能命令";
  }
  return "扩展命令";
}

function formatRuntimeSourceLabel(command: RuntimeCommandRecord): string {
  if (command.source === "skill") {
    return "技能";
  }
  if (command.source === "prompt") {
    return "提示词";
  }
  return command.sourceInfo.source.replace(/^extension:/, "");
}

export function formatSessionConfigStatus(config?: SessionConfig): string {
  const parts = [
    config?.provider && config?.modelId ? `模型 ${config.provider}:${config.modelId}` : undefined,
    config?.thinkingLevel ? `推理强度 ${config.thinkingLevel}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "当前没有会话级覆盖设置";
}

export function parseComposerCommand(value: string): ParsedComposerCommand | undefined {
  const trimmed = value.trim();
  if (trimmed === "/tree") {
    return { type: "tree" };
  }
  if (trimmed === "/status") {
    return { type: "status" };
  }
  if (trimmed === "/session") {
    return { type: "session" };
  }
  if (trimmed === "/reload") {
    return { type: "reload" };
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command === "/compact") {
    return { type: "compact", customInstructions: rest.join(" ").trim() || undefined };
  }
  if (command === "/name") {
    const title = rest.join(" ").trim();
    return title ? { type: "name", title } : undefined;
  }
  if (command === "/thinking") {
    const thinkingLevel = rest[0]?.trim();
    if (!thinkingLevel) {
      return undefined;
    }
    return { type: "thinking", thinkingLevel };
  }

  if (command === "/model") {
    if (rest.length >= 2) {
      return {
        type: "model",
        provider: rest[0] ?? "",
        modelId: rest.slice(1).join(" "),
      };
    }

    const combined = rest[0];
    if (combined?.includes(":")) {
      const [provider, ...modelParts] = combined.split(":");
      const modelId = modelParts.join(":");
      if (provider && modelId) {
        return { type: "model", provider, modelId };
      }
    }
  }

  return undefined;
}

export function incompleteComposerCommandMessage(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [command] = trimmed.split(/\s+/);
  return INCOMPLETE_COMMAND_MESSAGES[command as keyof typeof INCOMPLETE_COMMAND_MESSAGES];
}

export function isExactSlashCommand(query: string, command: ComposerSlashCommand): boolean {
  return query.trim().toLowerCase() === command.command.toLowerCase();
}

export function parseTreeComposerCommand(
  value: string,
): { readonly type: "tree" } | { readonly type: "error"; readonly message: string } | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command !== "/tree") {
    return undefined;
  }

  if (rest.length > 0) {
    return {
      type: "error",
      message: "/tree does not take arguments.",
    };
  }

  return { type: "tree" };
}
