import type {
  AppearanceThemeId,
  AppView,
  ConversationGroup,
  ExtensionCommandCompatibilityRecord,
  ComponentDockState,
  ModelSettingsScopeMode,
  NotificationPreferences,
  MobileSyncSettings,
  SessionCategoriesByWorkspace,
  SessionCategoryNode,
  SidebarTab,
} from "../src/desktop-state";
import type { ModelSettingsSnapshot } from "@pi-gui/session-driver/runtime-types";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const uiStateWriteQueueByPath = new Map<string, Promise<void>>();
export interface PersistedUiState {
  readonly version?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  readonly selectedWorkspaceId?: string;
  readonly selectedSessionId?: string;
  readonly activeView?: AppView;
  readonly composerDraft?: string;
  readonly composerDraftsBySession?: Record<string, string>;
  readonly extensionCommandCompatibilityByWorkspace?: Record<string, readonly ExtensionCommandCompatibilityRecord[]>;
  readonly notificationPreferences?: NotificationPreferences;
  readonly mobileSync?: MobileSyncSettings;
  readonly difyConfig?: import("../src/desktop-state").DifyConfig;
  readonly cliTools?: readonly import("../src/desktop-state").CliToolConfig[];
  readonly integratedTerminalShell?: string;
  readonly lastViewedAtBySession?: Record<string, string>;
  readonly workspaceOrder?: readonly string[];
  readonly modelSettingsScopeMode?: ModelSettingsScopeMode;
  readonly appGlobalModelSettings?: ModelSettingsSnapshot;
  readonly sidebarCollapsed?: boolean;
  readonly sidebarTab?: SidebarTab;
  readonly appearanceTheme?: AppearanceThemeId;
  readonly conversationGroups?: readonly ConversationGroup[];
  readonly allowMultiple?: boolean;
  readonly enableTransparency?: boolean;
  readonly backgroundGradientIntensity?: number;
  readonly componentDock?: ComponentDockState;
  readonly sessionCategoriesByWorkspace?: SessionCategoriesByWorkspace;
  readonly appMode?: "chat" | "development";
  readonly developmentModePresets?: readonly import("../src/desktop-state").DevelopmentModePreset[];
  readonly activeDevelopmentModePresetId?: string | null;
}

export interface LegacyPersistedUiState extends PersistedUiState {
  readonly composerAttachmentsBySession?: Record<string, readonly unknown[]>;
  readonly transcripts?: Record<string, readonly unknown[]>;
}

export async function readPersistedUiState(uiStateFilePath: string): Promise<LegacyPersistedUiState> {
  try {
    const raw = await readFile(uiStateFilePath, "utf8");
    const parsed = JSON.parse(raw) as LegacyPersistedUiState;
    return {
      version:
        parsed.version === 13
          ? 13
          : parsed.version === 12
          ? 12
          : parsed.version === 11
          ? 11
          : parsed.version === 10
            ? 10
            : parsed.version === 9
            ? 9
            : parsed.version === 8
            ? 8
            : parsed.version === 7
            ? 7
            : parsed.version === 6
              ? 6
              : parsed.version === 5
                ? 5
                : parsed.version === 4
                  ? 4
                  : parsed.version === 3
                    ? 3
                    : parsed.version === 2
                      ? 2
                      : undefined,
      selectedWorkspaceId: parsed.selectedWorkspaceId,
      selectedSessionId: parsed.selectedSessionId,
      activeView: parsed.activeView,
      composerDraft: parsed.composerDraft ?? "",
      composerDraftsBySession: parsed.composerDraftsBySession,
      extensionCommandCompatibilityByWorkspace: parsed.extensionCommandCompatibilityByWorkspace,
      notificationPreferences: parsed.notificationPreferences,
      mobileSync: toPersistedMobileSync(parsed.mobileSync),
      difyConfig: parsed.difyConfig,
      cliTools: parsed.cliTools,
      integratedTerminalShell:
        typeof parsed.integratedTerminalShell === "string" ? parsed.integratedTerminalShell : undefined,
      lastViewedAtBySession: parsed.lastViewedAtBySession,
      workspaceOrder: Array.isArray(parsed.workspaceOrder) ? parsed.workspaceOrder : undefined,
      modelSettingsScopeMode:
        parsed.modelSettingsScopeMode === "per-repo" || parsed.modelSettingsScopeMode === "app-global"
          ? parsed.modelSettingsScopeMode
          : undefined,
      appGlobalModelSettings: toPersistedModelSettingsSnapshot(parsed.appGlobalModelSettings),
      sidebarCollapsed: typeof parsed.sidebarCollapsed === "boolean" ? parsed.sidebarCollapsed : undefined,
      sidebarTab: parsed.sidebarTab === "conversations" || parsed.sidebarTab === "projects" ? parsed.sidebarTab : undefined,
      appearanceTheme: isAppearanceThemeId(parsed.appearanceTheme) ? parsed.appearanceTheme : undefined,
      conversationGroups: restoreConversationGroups(parsed.conversationGroups),
      allowMultiple: typeof parsed.allowMultiple === "boolean" ? parsed.allowMultiple : undefined,
      enableTransparency: typeof parsed.enableTransparency === "boolean" ? parsed.enableTransparency : undefined,
      backgroundGradientIntensity: toPersistedGradientIntensity(parsed.backgroundGradientIntensity),
      componentDock: toPersistedComponentDock(parsed.componentDock),
      sessionCategoriesByWorkspace: toPersistedSessionCategoriesByWorkspace(parsed.sessionCategoriesByWorkspace),
      appMode: parsed.appMode === "development" ? "development" : "chat",
      developmentModePresets: Array.isArray(parsed.developmentModePresets) ? parsed.developmentModePresets : undefined,
      activeDevelopmentModePresetId: typeof parsed.activeDevelopmentModePresetId === "string" ? parsed.activeDevelopmentModePresetId : null,
      composerAttachmentsBySession: parsed.composerAttachmentsBySession,
      transcripts: parsed.transcripts,
    };
  } catch {
    return {};
  }
}

export async function writePersistedUiState(
  uiStateFilePath: string,
  payload: PersistedUiState,
): Promise<void> {
  await enqueueUiStateWrite(uiStateFilePath, async () => {
    await mkdir(dirname(uiStateFilePath), { recursive: true });
    const serialized = `${JSON.stringify(
      {
        version: 13,
        ...payload,
      } satisfies PersistedUiState,
      null,
      2,
    )}\n`;
    const tmpPath = `${uiStateFilePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, serialized, "utf8");

    try {
      await rename(tmpPath, uiStateFilePath);
    } catch (error) {
      if (!isReplaceRenameError(error)) {
        await cleanupTempFile(tmpPath);
        throw error;
      }

      try {
        await unlink(uiStateFilePath);
      } catch (unlinkError) {
        if (!isMissingFileError(unlinkError)) {
          await cleanupTempFile(tmpPath);
          throw unlinkError;
        }
      }

      try {
        await rename(tmpPath, uiStateFilePath);
      } catch (renameError) {
        await cleanupTempFile(tmpPath);
        throw renameError;
      }
    }
  });
}

function isAppearanceThemeId(value: unknown): value is AppearanceThemeId {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
}

function restoreConversationGroups(value: unknown): readonly ConversationGroup[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const groups: ConversationGroup[] = [];
  const groupIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!id || !name || groupIds.has(id)) {
      continue;
    }
    groupIds.add(id);
    const sessions = Array.isArray(candidate.sessions)
      ? candidate.sessions.flatMap((session) => {
          if (!session || typeof session !== "object") {
            return [];
          }
          const ref = session as Record<string, unknown>;
          return typeof ref.workspaceId === "string" && typeof ref.sessionId === "string"
            ? [{ workspaceId: ref.workspaceId, sessionId: ref.sessionId }]
            : [];
        })
      : [];
    groups.push({
      id,
      name,
      sessions,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date(0).toISOString(),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    });
  }
  return groups;
}

function toPersistedMobileSync(value: unknown): MobileSyncSettings | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Partial<MobileSyncSettings>;
  const permissions = typeof candidate.permissions === "object" && candidate.permissions !== null
    ? candidate.permissions as Partial<MobileSyncSettings["permissions"]>
    : {};
  const serverUrl = typeof candidate.serverUrl === "string" ? candidate.serverUrl : "";
  return {
    serverUrl,
    pairToken: typeof candidate.pairToken === "string" ? candidate.pairToken : "",
    permissions: {
      taskList: permissions.taskList !== false,
      conversationDetails: permissions.conversationDetails !== false,
      notifications: permissions.notifications !== false,
      sendMessages: permissions.sendMessages !== false,
      stopRuns: permissions.stopRuns !== false,
      createSessions: permissions.createSessions !== false,
    },
    connectionStatus: serverUrl ? "disconnected" : "not-configured",
    ...(typeof candidate.lastConnectedAt === "string" ? { lastConnectedAt: candidate.lastConnectedAt } : {}),
    ...(typeof candidate.lastError === "string" ? { lastError: candidate.lastError } : {}),
  };
}

function toPersistedSessionCategoriesByWorkspace(value: unknown): SessionCategoriesByWorkspace | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record: Record<string, { version: 1; categories: SessionCategoryNode[] }> = {};
  for (const [workspaceId, rawTree] of Object.entries(value as Record<string, unknown>)) {
    if (!workspaceId || typeof rawTree !== "object" || rawTree === null) {
      continue;
    }
    const candidate = rawTree as { categories?: unknown };
    const categories = normalizePersistedSessionCategoryNodes(candidate.categories, 1);
    if (categories.length > 0) {
      record[workspaceId] = { version: 1, categories };
    }
  }

  return Object.keys(record).length > 0 ? record : undefined;
}

function normalizePersistedSessionCategoryNodes(value: unknown, depth: number): SessionCategoryNode[] {
  if (!Array.isArray(value) || depth > 3) {
    return [];
  }

  return value.flatMap((entry): SessionCategoryNode[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!id || !name) {
      return [];
    }

    const sessionRefs = Array.isArray(candidate.sessionRefs)
      ? candidate.sessionRefs.flatMap((ref): SessionCategoryNode["sessionRefs"] => {
          if (typeof ref !== "object" || ref === null) {
            return [];
          }
          const target = ref as Record<string, unknown>;
          return typeof target.workspaceId === "string" && typeof target.sessionId === "string"
            ? [{ workspaceId: target.workspaceId, sessionId: target.sessionId }]
            : [];
        })
      : [];

    return [{
      id,
      name,
      sessionRefs,
      children: normalizePersistedSessionCategoryNodes(candidate.children, depth + 1),
    }];
  });
}

function toPersistedComponentDock(value: unknown): ComponentDockState | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Partial<ComponentDockState>;
  return {
    componentDefinitions: Array.isArray(candidate.componentDefinitions)
      ? candidate.componentDefinitions.filter((entry): entry is ComponentDockState["componentDefinitions"][number] =>
          typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string",
        )
      : [],
    pinnedComponentIds: Array.isArray(candidate.pinnedComponentIds)
      ? candidate.pinnedComponentIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    ...(typeof candidate.activeComponentId === "string" ? { activeComponentId: candidate.activeComponentId } : {}),
  };
}

function toPersistedGradientIntensity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toPersistedModelSettingsSnapshot(value: unknown): ModelSettingsSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const enabledModelPatterns = Array.isArray(candidate.enabledModelPatterns)
    ? candidate.enabledModelPatterns.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    ...(typeof candidate.defaultProvider === "string" ? { defaultProvider: candidate.defaultProvider } : {}),
    ...(typeof candidate.defaultModelId === "string" ? { defaultModelId: candidate.defaultModelId } : {}),
    ...(typeof candidate.defaultThinkingLevel === "string"
      ? { defaultThinkingLevel: candidate.defaultThinkingLevel as ModelSettingsSnapshot["defaultThinkingLevel"] }
      : {}),
    enabledModelPatterns,
  };
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isReplaceRenameError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "EEXIST" || error.code === "EPERM");
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

async function enqueueUiStateWrite(uiStateFilePath: string, write: () => Promise<void>): Promise<void> {
  const previous = uiStateWriteQueueByPath.get(uiStateFilePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  uiStateWriteQueueByPath.set(uiStateFilePath, next);

  try {
    await next;
  } finally {
    if (uiStateWriteQueueByPath.get(uiStateFilePath) === next) {
      uiStateWriteQueueByPath.delete(uiStateFilePath);
    }
  }
}
