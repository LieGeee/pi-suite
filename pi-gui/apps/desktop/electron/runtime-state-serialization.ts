import type { RuntimeCommandRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";

const RUNTIME_COMMAND_DESCRIPTION_LIMIT = 1_000;
const RUNTIME_COMMAND_SOURCE_LABEL_LIMIT = 500;
const RUNTIME_SKILL_DESCRIPTION_LIMIT = 2_000;
const RUNTIME_EXTENSION_DESCRIPTION_LIMIT = 2_000;
const RUNTIME_EXTENSION_DIAGNOSTIC_LIMIT = 2_000;

export function serializeRuntimeSnapshotForRenderer(runtime: RuntimeSnapshot): RuntimeSnapshot {
  return {
    ...runtime,
    skills: runtime.skills.map((skill) => ({
      ...skill,
      description: truncateRuntimeText(skill.description, RUNTIME_SKILL_DESCRIPTION_LIMIT, "技能描述"),
    })),
    extensions: runtime.extensions.map((extension) => ({
      ...extension,
      ...(extension.description
        ? { description: truncateRuntimeText(extension.description, RUNTIME_EXTENSION_DESCRIPTION_LIMIT, "扩展描述") }
        : {}),
      sourceInfo: {
        ...extension.sourceInfo,
        source: truncateRuntimeText(extension.sourceInfo.source, RUNTIME_COMMAND_SOURCE_LABEL_LIMIT, "扩展来源"),
      },
      diagnostics: extension.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        message: truncateRuntimeText(diagnostic.message, RUNTIME_EXTENSION_DIAGNOSTIC_LIMIT, "扩展诊断"),
      })),
    })),
  };
}

export function serializeRuntimeByWorkspaceForRenderer(
  runtimeByWorkspace: ReadonlyMap<string, RuntimeSnapshot>,
): Record<string, RuntimeSnapshot> {
  return Object.fromEntries(
    [...runtimeByWorkspace.entries()].map(([workspaceId, runtime]) => [workspaceId, serializeRuntimeSnapshotForRenderer(runtime)] as const),
  );
}

export function serializeSessionCommandsForRenderer(
  commands: readonly RuntimeCommandRecord[] | undefined,
): RuntimeCommandRecord[] | undefined {
  if (!commands) {
    return undefined;
  }
  return commands.map((command) => ({
    ...command,
    ...(command.description
      ? { description: truncateRuntimeText(command.description, RUNTIME_COMMAND_DESCRIPTION_LIMIT, "命令描述") }
      : {}),
    sourceInfo: {
      ...command.sourceInfo,
      source: truncateRuntimeText(command.sourceInfo.source, RUNTIME_COMMAND_SOURCE_LABEL_LIMIT, "命令来源"),
    },
  }));
}

export function serializeSessionCommandsBySessionForRenderer(
  commandsBySession: ReadonlyMap<string, readonly RuntimeCommandRecord[]>,
): Record<string, readonly RuntimeCommandRecord[]> {
  return Object.fromEntries(
    [...commandsBySession.entries()].map(([key, commands]) => [key, serializeSessionCommandsForRenderer(commands) ?? []] as const),
  );
}

function truncateRuntimeText(text: string, limit: number, label: string): string {
  if (limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n…[${label}已截断；完整内容仍保留在主进程运行时状态中]…`;
}
