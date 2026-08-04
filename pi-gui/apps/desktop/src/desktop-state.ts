import type { HostUiRequest, SessionConfig } from "@pi-gui/session-driver";
import type { ModelSettingsSnapshot, RuntimeCommandRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  AgentModelSelection,
  AiChatComponentConfig,
  DevelopmentModeConfig,
  DevelopmentSubagentConfig,
  DockComponentDefinition,
  DockComponentEnvironment,
  DockComponentGenerationInput,
  DockComponentKind,
  DockComponentSource,
  ExternalLinkComponentConfig,
} from "@pi-gui/pi-sdk-driver";
export type { AgentModelSelection, AiChatComponentConfig, DevelopmentModeConfig, DevelopmentSubagentConfig, DockComponentDefinition, DockComponentEnvironment, DockComponentGenerationInput, DockComponentKind, DockComponentSource, ExternalLinkComponentConfig } from "@pi-gui/pi-sdk-driver";
export type SessionStatus = "idle" | "running" | "failed";
export type { SessionRole, TranscriptMessage } from "./timeline-types";
import type { TranscriptMessage } from "./timeline-types";

export type AppView = "threads" | "new-thread" | "skills" | "extensions" | "settings";
export type AppMode = "chat" | "development";
export type WorkspaceKind = "primary" | "worktree";
export type WorktreeStatus = "ready" | "missing" | "error";
export type NewThreadEnvironment = "local" | "worktree";
export type ThemeMode = "system" | "light" | "dark";
export type AppearanceThemeId = string;

export interface AppearanceThemeRecord {
  readonly id: AppearanceThemeId;
  readonly name: string;
  readonly description: string;
  readonly variables?: Readonly<Record<string, string>>;
  readonly heroImageUrl?: string;
}

export type SidebarTab = "conversations" | "projects";
export type ModelSettingsScopeMode = "app-global" | "per-repo";

export interface ConversationSessionRef {
  readonly workspaceId: string;
  readonly sessionId: string;
}

export interface ConversationGroup {
  readonly id: string;
  readonly name: string;
  readonly sessions: readonly ConversationSessionRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ComponentDockState {
  readonly componentDefinitions: readonly DockComponentDefinition[];
  readonly pinnedComponentIds: readonly string[];
  readonly activeComponentId?: string;
}

export interface DevelopmentModePreset {
  readonly id: string;
  readonly name: string;
  readonly config: DevelopmentModeConfig;
}
export type ComposerDraftSyncSource =
  | "state"
  | "selection"
  | "persist"
  | "remote-persist"
  | "command"
  | "extension-editor-text"
  | "queued-message-edit";

export interface NotificationPreferences {
  readonly backgroundCompletion: boolean;
  readonly backgroundFailure: boolean;
  readonly attentionNeeded: boolean;
  readonly soundEnabled: boolean;
}

export type MobileSyncConnectionStatus = "not-configured" | "connecting" | "connected" | "disconnected" | "auth-failed";

export interface MobileSyncPermissions {
  readonly taskList: boolean;
  readonly conversationDetails: boolean;
  readonly notifications: boolean;
  readonly sendMessages: boolean;
  readonly stopRuns: boolean;
  readonly createSessions: boolean;
}

export interface MobileSyncSettings {
  readonly serverUrl: string;
  readonly pairToken: string;
  readonly permissions: MobileSyncPermissions;
  readonly connectionStatus: MobileSyncConnectionStatus;
  readonly lastConnectedAt?: string;
  readonly lastError?: string;
}

export interface ComposerImageAttachment {
  readonly id: string;
  readonly kind: "image";
  readonly name: string;
  readonly mimeType: string;
  readonly data: string;
  readonly omittedData?: boolean;
  readonly dataBytes?: number;
}

export interface ComposerFileAttachment {
  readonly id: string;
  readonly kind: "file";
  readonly name: string;
  readonly mimeType: string;
  readonly fsPath: string;
  readonly sizeBytes?: number;
}

export type ComposerAttachment = ComposerImageAttachment | ComposerFileAttachment;

export type QueuedComposerMessageMode = "steer" | "followUp";

export interface QueuedComposerMessage {
  readonly id: string;
  readonly mode: QueuedComposerMessageMode;
  readonly text: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly lastViewedAt?: string;
  readonly archivedAt?: string;
  readonly preview: string;
  readonly status: SessionStatus;
  readonly runningSince?: string;
  readonly hasUnseenUpdate: boolean;
  readonly config?: SessionConfig;
}

export interface SelectedTranscriptRecord {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly transcript: readonly TranscriptMessage[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly replaceView?: boolean;
}

/** Normalized view — enables targeted per-message patches without array copy. */
export interface NormalizedTranscriptView {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly messageIds: readonly string[];
  readonly messagesById: Readonly<Record<string, TranscriptMessage>>;
  readonly startIndex: number;
  readonly totalCount: number;
}

export interface WorktreeRecord {
  readonly id: string;
  readonly rootWorkspaceId: string;
  readonly linkedWorkspaceId?: string;
  readonly name: string;
  readonly path: string;
  readonly status: WorktreeStatus;
  readonly branchName?: string;
  readonly updatedAt: string;
}

export interface SessionExtensionStatusRecord {
  readonly key: string;
  readonly text: string;
}

export interface SessionExtensionWidgetRecord {
  readonly key: string;
  readonly lines: readonly string[];
  readonly placement: "aboveComposer" | "belowComposer";
}

export type SessionExtensionDialogRecord = Extract<
  HostUiRequest,
  { readonly kind: "confirm" | "select" | "input" | "editor" }
>;

export interface SessionExtensionUiStateRecord {
  readonly statuses: readonly SessionExtensionStatusRecord[];
  readonly widgets: readonly SessionExtensionWidgetRecord[];
  readonly pendingDialogs: readonly SessionExtensionDialogRecord[];
  readonly title?: string;
  readonly editorText?: string;
}

export type ExtensionCommandCompatibilityStatus = "supported" | "terminal-only";

export interface ExtensionCommandCompatibilityRecord {
  readonly commandName: string;
  readonly extensionPath: string;
  readonly status: ExtensionCommandCompatibilityStatus;
  readonly message: string;
  readonly capability: string;
  readonly updatedAt: string;
}

export interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly lastOpenedAt: string;
  readonly kind: WorkspaceKind;
  readonly rootWorkspaceId?: string;
  readonly branchName?: string;
  readonly sessions: readonly SessionRecord[];
}

export interface CreateWorktreeInput {
  readonly workspaceId: string;
  readonly fromSessionWorkspaceId?: string;
  readonly fromSessionId?: string;
}

export type StartThreadInput = {
  readonly rootWorkspaceId: string;
  readonly environment: NewThreadEnvironment;
  readonly prompt?: string;
  readonly attachments?: readonly ComposerAttachment[];
  readonly provider?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: string;
};

export interface RemoveWorktreeInput {
  readonly workspaceId: string;
  readonly worktreeId: string;
}

export type DesktopSessionEventKind = "runCompleted" | "runFailed" | "hostUiRequest";

export interface DevelopmentWorkflowOutputProjection {
  readonly role: string;
  readonly text: string;
  readonly truncated: boolean;
}

export interface DevelopmentWorkflowProjection {
  readonly outputs: readonly DevelopmentWorkflowOutputProjection[];
  readonly outputCount: number;
}

export interface DifyConfig {
  readonly serverUrl: string;
  readonly apiKey: string;
}

export interface CliConnection {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database?: string;
  readonly extraArgs?: readonly string[];
}

export interface CliToolConfig {
  readonly name: string;
  readonly command: string;
  readonly argsTemplate?: readonly string[];
  readonly connections: readonly CliConnection[];
  readonly activeConnection?: string;
}

export interface DesktopAppState {
  readonly workspaces: readonly WorkspaceRecord[];
  readonly worktreesByWorkspace: Readonly<Record<string, readonly WorktreeRecord[]>>;
  readonly selectedWorkspaceId: string;
  readonly selectedSessionId: string;
  readonly activeView: AppView;
  readonly composerDraft: string;
  readonly composerDraftSyncSource: ComposerDraftSyncSource;
  readonly composerDraftSyncNonce: number;
  readonly composerAttachments: readonly ComposerAttachment[];
  readonly queuedComposerMessages: readonly QueuedComposerMessage[];
  readonly editingQueuedMessageId?: string;
  readonly runtimeByWorkspace: Readonly<Record<string, RuntimeSnapshot>>;
  readonly sessionCommandsBySession: Readonly<Record<string, readonly RuntimeCommandRecord[]>>;
  readonly sessionExtensionUiBySession: Readonly<Record<string, SessionExtensionUiStateRecord>>;
  readonly extensionCommandCompatibilityByWorkspace: Readonly<Record<string, readonly ExtensionCommandCompatibilityRecord[]>>;
  readonly notificationPreferences: NotificationPreferences;
  readonly mobileSync: MobileSyncSettings;
  readonly integratedTerminalShell: string;
  readonly lastViewedAtBySession: Readonly<Record<string, string>>;
  readonly workspaceOrder: readonly string[];
  readonly modelSettingsScopeMode: ModelSettingsScopeMode;
  readonly globalModelSettings: ModelSettingsSnapshot;
  readonly sidebarCollapsed: boolean;
  readonly sidebarTab: SidebarTab;
  readonly appearanceTheme: AppearanceThemeId;
  readonly appearanceThemes: readonly AppearanceThemeRecord[];
  readonly conversationGroups: readonly ConversationGroup[];
  readonly enableTransparency: boolean;
  readonly backgroundGradientIntensity: number;
  readonly componentDock: ComponentDockState;
  readonly sessionCategoriesByWorkspace: SessionCategoriesByWorkspace;
  readonly appMode: AppMode;
  readonly developmentModePresets: readonly DevelopmentModePreset[];
  readonly activeDevelopmentModePresetId: string | null;
  readonly developmentWorkflowProjection: DevelopmentWorkflowProjection;
  readonly revision: number;
  readonly lastSessionEvent?: {
    readonly kind: DesktopSessionEventKind;
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly timestamp: string;
  };
  readonly lastError?: string;
  readonly difyConfig?: DifyConfig;
  readonly cliTools?: readonly CliToolConfig[];
}

export interface CreateSessionInput {
  readonly workspaceId: string;
  readonly title?: string;
}

export interface WorkspaceSessionTarget {
  readonly workspaceId: string;
  readonly sessionId: string;
}

export interface SessionCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly sessionRefs: readonly WorkspaceSessionTarget[];
  readonly children: readonly SessionCategoryNode[];
}

export interface WorkspaceSessionCategories {
  readonly version: 1;
  readonly categories: readonly SessionCategoryNode[];
}

export type SessionCategoriesByWorkspace = Readonly<Record<string, WorkspaceSessionCategories>>;

export function createEmptyDesktopAppState(): DesktopAppState {
  return {
    workspaces: [],
    worktreesByWorkspace: {},
    selectedWorkspaceId: "",
    selectedSessionId: "",
    activeView: "threads",
    composerDraft: "",
    composerDraftSyncSource: "state",
    composerDraftSyncNonce: 0,
    composerAttachments: [],
    queuedComposerMessages: [],
    runtimeByWorkspace: {},
    sessionCommandsBySession: {},
    sessionExtensionUiBySession: {},
    extensionCommandCompatibilityByWorkspace: {},
    notificationPreferences: {
      backgroundCompletion: true,
      backgroundFailure: true,
      attentionNeeded: true,
      soundEnabled: true,
    },
    mobileSync: {
      serverUrl: "ws://localhost:8787/ws/desktop",
      pairToken: "",
      permissions: {
        taskList: true,
        conversationDetails: true,
        notifications: true,
        sendMessages: true,
        stopRuns: true,
        createSessions: true,
      },
      connectionStatus: "not-configured",
    },
    integratedTerminalShell: "",
    lastViewedAtBySession: {},
    workspaceOrder: [],
    modelSettingsScopeMode: "app-global",
    globalModelSettings: {
      enabledModelPatterns: [],
    },
    sidebarCollapsed: false,
    sidebarTab: "conversations",
    appearanceTheme: "miku-dream",
    appearanceThemes: [],
    conversationGroups: [],
    enableTransparency: false,
    backgroundGradientIntensity: 72,
    componentDock: {
      componentDefinitions: [],
      pinnedComponentIds: [],
    },
    sessionCategoriesByWorkspace: {},
    appMode: "chat",
    developmentModePresets: [
      {
        id: "preset-example",
        name: "示例方案",
        config: {
          workflow: "proposal-review",
          environment: "local",
          subagentLaunchPolicy: "first-message",
          mainAgent: { provider: "caease", modelId: "gpt-5.5", thinkingLevel: "medium" },
          documentContext: {
            enabled: true,
            paths: ["S:/note/xl-ht"],
            shareWithSubagents: true,
          },
          subagents: [
            {
              id: "sub-dpsk",
              name: "deepseek-v4-pro",
              role: "reviewer",
              model: { provider: "deepseek", modelId: "deepseek-v4-pro", thinkingLevel: "medium" },
              permission: "exec",
              trigger: "manual",
            },
          ],
        },
      },
    ],
    activeDevelopmentModePresetId: null,
    developmentWorkflowProjection: { outputs: [], outputCount: 0 },
    revision: 0,
  };
}

export function getSelectedWorkspace(state: DesktopAppState): WorkspaceRecord | undefined {
  return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId);
}

export function getSelectedSession(state: DesktopAppState): SessionRecord | undefined {
  return getSelectedWorkspace(state)?.sessions.find((session) => session.id === state.selectedSessionId);
}
