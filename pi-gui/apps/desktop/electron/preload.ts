import { contextBridge, ipcRenderer, webUtils } from "electron";
import { PRELOAD_DEV_RELOAD_MARKER } from "./dev-reload-preload-probe";
import {
  desktopIpc,
  type DesktopComputerUsePrivacyPane,
  type DesktopComputerUseStatus,
  type DesktopNotificationPermissionStatus,
  type PiDesktopApi,
  type PiDesktopCommand,
  type ThirdPartyModelDiscoveryInput,
  type ThirdPartyModelProviderInput,
  type TerminalDataEvent,
  type TerminalErrorEvent,
  type TerminalExitEvent,
  type TerminalPanelSnapshot,
  type TerminalSize,
  type ToolContentRequest,
  type TranscriptWindowRequest,
} from "../src/ipc";
import type {
  NavigateSessionTreeOptions,
  NavigateSessionTreeResult,
  SessionTreeSnapshot,
} from "@pi-gui/session-driver/types";
import type {
  HostUiResponse,
} from "@pi-gui/session-driver";
import type { RuntimeSettingsSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  AppearanceThemeId,
  AppView,
  ComponentDockState,
  ComposerAttachment,
  ComposerImageAttachment,
  ConversationSessionRef,
  CreateSessionInput,
  CreateWorktreeInput,
  DesktopAppState,
  DockComponentDefinition,
  DockComponentGenerationInput,
  NotificationPreferences,
  MobileSyncSettings,
  RemoveWorktreeInput,
  SelectedTranscriptRecord,
  SessionCategoryNode,
  SidebarTab,
  StartThreadInput,
  TranscriptMessage,
  WorkspaceSessionTarget,
} from "../src/desktop-state";

const devReloadMarkersEnabled = process.env.PI_APP_DEV_RELOAD_MARKERS === "1";

function resolveDevReloadMarkers() {
  if (!devReloadMarkersEnabled) {
    return undefined;
  }

  return {
    preload: PRELOAD_DEV_RELOAD_MARKER,
  };
}

const devReloadMarkers = resolveDevReloadMarkers();

if (devReloadMarkers) {
  contextBridge.exposeInMainWorld("__piDevReloadHost", devReloadMarkers);
}

function subscribeIpc<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("piApp", {
  platform: process.platform,
  versions: process.versions,
  ping: () => ipcRenderer.invoke(desktopIpc.ping) as Promise<string>,
  getState: () => ipcRenderer.invoke(desktopIpc.stateRequest) as Promise<DesktopAppState>,
  onStateChanged: (listener: (state: DesktopAppState) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, state: DesktopAppState) => {
      listener(state);
    };
    ipcRenderer.on(desktopIpc.stateChanged, handle);
    return () => {
      ipcRenderer.removeListener(desktopIpc.stateChanged, handle);
    };
  },
  getSelectedTranscript: () =>
    ipcRenderer.invoke(desktopIpc.selectedTranscriptRequest) as Promise<SelectedTranscriptRecord | null>,
  getSelectedTranscriptWindow: (request: TranscriptWindowRequest) =>
    ipcRenderer.invoke(desktopIpc.selectedTranscriptWindowRequest, request) as Promise<SelectedTranscriptRecord | null>,
  getToolContent: (request: ToolContentRequest) =>
    ipcRenderer.invoke(desktopIpc.toolContentRequest, request) as Promise<Extract<TranscriptMessage, { kind: "tool" }> | null>,
  onSelectedTranscriptChanged: (listener: (payload: SelectedTranscriptRecord | null) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, payload: SelectedTranscriptRecord | null) => {
      listener(payload);
    };
    ipcRenderer.on(desktopIpc.selectedTranscriptChanged, handle);
    return () => {
      ipcRenderer.removeListener(desktopIpc.selectedTranscriptChanged, handle);
    };
  },
  onTranscriptDelta: (listener: PiDesktopApi["onTranscriptDelta"] extends (listener: infer L) => () => void ? L : never) => {
    const handle = (_event: Electron.IpcRendererEvent, delta: Parameters<Parameters<PiDesktopApi["onTranscriptDelta"]>[0]>[0]) => {
      listener(delta);
    };
    ipcRenderer.on(desktopIpc.selectedTranscriptDelta, handle);
    return () => {
      ipcRenderer.removeListener(desktopIpc.selectedTranscriptDelta, handle);
    };
  },
  onCommand: (listener: (command: PiDesktopCommand) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, command: PiDesktopCommand) => {
      listener(command);
    };
    ipcRenderer.on(desktopIpc.appCommand, handle);
    return () => {
      ipcRenderer.removeListener(desktopIpc.appCommand, handle);
    };
  },
  onWorkspacePicked: (listener: (workspaceId: string) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, workspaceId: string) => {
      listener(workspaceId);
    };
    ipcRenderer.on(desktopIpc.workspacePicked, handle);
    return () => {
      ipcRenderer.removeListener(desktopIpc.workspacePicked, handle);
    };
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  addWorkspacePath: (workspacePath: string) =>
    ipcRenderer.invoke(desktopIpc.addWorkspacePath, workspacePath) as Promise<DesktopAppState>,
  pickWorkspace: () => ipcRenderer.invoke(desktopIpc.pickWorkspace) as Promise<DesktopAppState>,
  selectWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke(desktopIpc.selectWorkspace, workspaceId) as Promise<DesktopAppState>,
  renameWorkspace: (workspaceId: string, displayName: string) =>
    ipcRenderer.invoke(desktopIpc.renameWorkspace, workspaceId, displayName) as Promise<DesktopAppState>,
  removeWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke(desktopIpc.removeWorkspace, workspaceId) as Promise<DesktopAppState>,
  reorderWorkspaces: (workspaceOrder: readonly string[]) =>
    ipcRenderer.invoke(desktopIpc.reorderWorkspaces, workspaceOrder) as Promise<DesktopAppState>,
  openWorkspaceInFinder: (workspaceId: string) =>
    ipcRenderer.invoke(desktopIpc.openWorkspaceInFinder, workspaceId) as Promise<void>,
  createWorktree: (input: CreateWorktreeInput) =>
    ipcRenderer.invoke(desktopIpc.createWorktree, input) as Promise<DesktopAppState>,
  removeWorktree: (input: RemoveWorktreeInput) =>
    ipcRenderer.invoke(desktopIpc.removeWorktree, input) as Promise<DesktopAppState>,
  openSkillInFinder: (workspaceId: string, filePath: string) =>
    ipcRenderer.invoke(desktopIpc.openSkillInFinder, workspaceId, filePath) as Promise<void>,
  openExtensionInFinder: (workspaceId: string, filePath: string) =>
    ipcRenderer.invoke(desktopIpc.openExtensionInFinder, workspaceId, filePath) as Promise<void>,
  syncCurrentWorkspace: () =>
    ipcRenderer.invoke(desktopIpc.syncCurrentWorkspace) as Promise<DesktopAppState>,
  selectSession: (target: WorkspaceSessionTarget) =>
    ipcRenderer.invoke(desktopIpc.selectSession, target) as Promise<DesktopAppState>,
  renameSession: (target: WorkspaceSessionTarget, title: string) =>
    ipcRenderer.invoke(desktopIpc.renameSession, target, title) as Promise<DesktopAppState>,
  archiveSession: (target: WorkspaceSessionTarget) =>
    ipcRenderer.invoke(desktopIpc.archiveSession, target) as Promise<DesktopAppState>,
  unarchiveSession: (target: WorkspaceSessionTarget) =>
    ipcRenderer.invoke(desktopIpc.unarchiveSession, target) as Promise<DesktopAppState>,
  createSession: (input: CreateSessionInput) =>
    ipcRenderer.invoke(desktopIpc.createSession, input) as Promise<DesktopAppState>,
  startThread: (input: StartThreadInput) =>
    ipcRenderer.invoke(desktopIpc.startThread, input) as Promise<DesktopAppState>,
  cancelCurrentRun: () => ipcRenderer.invoke(desktopIpc.cancelCurrentRun) as Promise<DesktopAppState>,
  setActiveView: (view: AppView) =>
    ipcRenderer.invoke(desktopIpc.setActiveView, view) as Promise<DesktopAppState>,
  setSidebarCollapsed: (collapsed: boolean) =>
    ipcRenderer.invoke(desktopIpc.setSidebarCollapsed, collapsed) as Promise<DesktopAppState>,
  setSidebarTab: (tab: SidebarTab) =>
    ipcRenderer.invoke(desktopIpc.setSidebarTab, tab) as Promise<DesktopAppState>,
  setAppearanceTheme: (theme: AppearanceThemeId) =>
    ipcRenderer.invoke(desktopIpc.setAppearanceTheme, theme) as Promise<DesktopAppState>,
  createConversationGroup: (name: string) =>
    ipcRenderer.invoke(desktopIpc.createConversationGroup, name) as Promise<DesktopAppState>,
  renameConversationGroup: (groupId: string, name: string) =>
    ipcRenderer.invoke(desktopIpc.renameConversationGroup, groupId, name) as Promise<DesktopAppState>,
  deleteConversationGroup: (groupId: string) =>
    ipcRenderer.invoke(desktopIpc.deleteConversationGroup, groupId) as Promise<DesktopAppState>,
  assignConversationToGroup: (target: ConversationSessionRef, groupId?: string) =>
    ipcRenderer.invoke(desktopIpc.assignConversationToGroup, target, groupId) as Promise<DesktopAppState>,
  refreshRuntime: (workspaceId?: string) =>
    ipcRenderer.invoke(desktopIpc.refreshRuntime, workspaceId) as Promise<DesktopAppState>,
  setModelSettingsScopeMode: (mode: "app-global" | "per-repo") =>
    ipcRenderer.invoke(desktopIpc.setModelSettingsScopeMode, mode) as Promise<DesktopAppState>,
  setDefaultModel: (workspaceId: string, provider: string, modelId: string) =>
    ipcRenderer.invoke(desktopIpc.setDefaultModel, workspaceId, provider, modelId) as Promise<DesktopAppState>,
  setDefaultThinkingLevel: (workspaceId: string, thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"]) =>
    ipcRenderer.invoke(desktopIpc.setDefaultThinkingLevel, workspaceId, thinkingLevel) as Promise<DesktopAppState>,
  setSessionModel: (workspaceId: string, sessionId: string, provider: string, modelId: string) =>
    ipcRenderer.invoke(desktopIpc.setSessionModel, workspaceId, sessionId, provider, modelId) as Promise<DesktopAppState>,
  setSessionThinkingLevel: (workspaceId: string, sessionId: string, thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"]) =>
    ipcRenderer.invoke(desktopIpc.setSessionThinkingLevel, workspaceId, sessionId, thinkingLevel) as Promise<DesktopAppState>,
  loginProvider: (workspaceId: string, providerId: string) =>
    ipcRenderer.invoke(desktopIpc.loginProvider, workspaceId, providerId) as Promise<DesktopAppState>,
  logoutProvider: (workspaceId: string, providerId: string) =>
    ipcRenderer.invoke(desktopIpc.logoutProvider, workspaceId, providerId) as Promise<DesktopAppState>,
  setProviderApiKey: (workspaceId: string, providerId: string, apiKey: string) =>
    ipcRenderer.invoke(desktopIpc.setProviderApiKey, workspaceId, providerId, apiKey) as Promise<DesktopAppState>,
  discoverThirdPartyModels: (input: ThirdPartyModelDiscoveryInput) =>
    ipcRenderer.invoke(desktopIpc.discoverThirdPartyModels, input),
  saveThirdPartyModelProvider: (workspaceId: string, input: ThirdPartyModelProviderInput) =>
    ipcRenderer.invoke(desktopIpc.saveThirdPartyModelProvider, workspaceId, input) as Promise<DesktopAppState>,
  setEnableSkillCommands: (workspaceId: string, enabled: boolean) =>
    ipcRenderer.invoke(desktopIpc.setEnableSkillCommands, workspaceId, enabled) as Promise<DesktopAppState>,
  setScopedModelPatterns: (workspaceId: string, patterns: readonly string[]) =>
    ipcRenderer.invoke(desktopIpc.setScopedModelPatterns, workspaceId, patterns) as Promise<DesktopAppState>,
  setSkillEnabled: (workspaceId: string, filePath: string, enabled: boolean) =>
    ipcRenderer.invoke(desktopIpc.setSkillEnabled, workspaceId, filePath, enabled) as Promise<DesktopAppState>,
  setExtensionEnabled: (workspaceId: string, filePath: string, enabled: boolean) =>
    ipcRenderer.invoke(desktopIpc.setExtensionEnabled, workspaceId, filePath, enabled) as Promise<DesktopAppState>,
  respondToHostUiRequest: (workspaceId: string, sessionId: string, response: HostUiResponse) =>
    ipcRenderer.invoke(desktopIpc.respondToHostUiRequest, workspaceId, sessionId, response) as Promise<DesktopAppState>,
  setNotificationPreferences: (preferences: Partial<NotificationPreferences>) =>
    ipcRenderer.invoke(desktopIpc.setNotificationPreferences, preferences) as Promise<DesktopAppState>,
  setMobileSyncSettings: (settings: MobileSyncSettings) =>
    ipcRenderer.invoke(desktopIpc.setMobileSyncSettings, settings) as Promise<DesktopAppState>,
  setDifyConfig: (config: import("../src/desktop-state").DifyConfig) =>
    ipcRenderer.invoke(desktopIpc.setDifyConfig, config) as Promise<DesktopAppState>,
  generateMobileSyncPairQrCode: (relayUrl: string) =>
    ipcRenderer.invoke(desktopIpc.generateMobileSyncPairQrCode, relayUrl) as Promise<{ pairToken: string; qrImage: string; qrData: string }>,
  setIntegratedTerminalShell: (shellPath: string) =>
    ipcRenderer.invoke(desktopIpc.setIntegratedTerminalShell, shellPath) as Promise<DesktopAppState>,
  setEnableTransparency: (enabled: boolean) =>
    ipcRenderer.invoke(desktopIpc.setEnableTransparency, enabled) as Promise<DesktopAppState>,
  setBackgroundGradientIntensity: (value: number) =>
    ipcRenderer.invoke(desktopIpc.setBackgroundGradientIntensity, value) as Promise<DesktopAppState>,
  setComponentDock: (componentDock: ComponentDockState) =>
    ipcRenderer.invoke(desktopIpc.setComponentDock, componentDock) as Promise<DesktopAppState>,
  setDevelopmentModePresets: (presets: readonly import("../src/desktop-state").DevelopmentModePreset[]) =>
    ipcRenderer.invoke(desktopIpc.setDevelopmentModePresets, presets) as Promise<DesktopAppState>,
  setActiveDevelopmentModePresetId: (id: string | null) =>
    ipcRenderer.invoke(desktopIpc.setActiveDevelopmentModePresetId, id) as Promise<DesktopAppState>,
  setAppMode: (mode: "chat" | "development") =>
    ipcRenderer.invoke(desktopIpc.setAppMode, mode) as Promise<DesktopAppState>,
  saveDockComponentDefinition: (definition: DockComponentDefinition, pinned: boolean) =>
    ipcRenderer.invoke(desktopIpc.saveDockComponentDefinition, definition, pinned) as Promise<DesktopAppState>,
  generateDockComponentDefinition: (input: DockComponentGenerationInput) =>
    ipcRenderer.invoke(desktopIpc.generateDockComponentDefinition, input) as Promise<DockComponentDefinition | null>,
  setWorkspaceSessionCategories: (workspaceId: string, categories: readonly SessionCategoryNode[]) =>
    ipcRenderer.invoke(desktopIpc.setWorkspaceSessionCategories, workspaceId, categories) as Promise<DesktopAppState>,
  ensureTerminalPanel: (workspaceId: string, terminalScopeId: string, size?: Partial<TerminalSize>) =>
    ipcRenderer.invoke(desktopIpc.terminalEnsurePanel, workspaceId, terminalScopeId, size) as Promise<TerminalPanelSnapshot>,
  createTerminalSession: (workspaceId: string, terminalScopeId: string, size?: Partial<TerminalSize>) =>
    ipcRenderer.invoke(desktopIpc.terminalCreateSession, workspaceId, terminalScopeId, size) as Promise<TerminalPanelSnapshot>,
  setActiveTerminalSession: (workspaceId: string, terminalScopeId: string, terminalId: string) =>
    ipcRenderer.invoke(desktopIpc.terminalSetActiveSession, workspaceId, terminalScopeId, terminalId) as Promise<TerminalPanelSnapshot>,
  writeTerminal: (terminalId: string, data: string) =>
    ipcRenderer.invoke(desktopIpc.terminalWrite, terminalId, data) as Promise<void>,
  resizeTerminal: (terminalId: string, size: TerminalSize) =>
    ipcRenderer.invoke(desktopIpc.terminalResize, terminalId, size) as Promise<void>,
  restartTerminalSession: (terminalId: string, size?: Partial<TerminalSize>) =>
    ipcRenderer.invoke(desktopIpc.terminalRestartSession, terminalId, size) as Promise<TerminalPanelSnapshot>,
  closeTerminalSession: (terminalId: string) =>
    ipcRenderer.invoke(desktopIpc.terminalCloseSession, terminalId) as Promise<TerminalPanelSnapshot | null>,
  setTerminalTitle: (terminalId: string, title: string) =>
    ipcRenderer.invoke(desktopIpc.terminalSetTitle, terminalId, title) as Promise<void>,
  setTerminalFocused: (focused: boolean) => {
    ipcRenderer.send(desktopIpc.terminalSetFocused, focused);
    return Promise.resolve();
  },
  onTerminalData: (listener: (event: TerminalDataEvent) => void) =>
    subscribeIpc(desktopIpc.terminalData, listener),
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) =>
    subscribeIpc(desktopIpc.terminalExit, listener),
  onTerminalError: (listener: (event: TerminalErrorEvent) => void) =>
    subscribeIpc(desktopIpc.terminalError, listener),
  getNotificationPermissionStatus: () =>
    ipcRenderer.invoke(desktopIpc.getNotificationPermissionStatus) as Promise<DesktopNotificationPermissionStatus>,
  requestNotificationPermission: () =>
    ipcRenderer.invoke(desktopIpc.requestNotificationPermission) as Promise<DesktopNotificationPermissionStatus>,
  openSystemNotificationSettings: () =>
    ipcRenderer.invoke(desktopIpc.openSystemNotificationSettings) as Promise<void>,
  getComputerUseStatus: () =>
    ipcRenderer.invoke(desktopIpc.getComputerUseStatus) as Promise<DesktopComputerUseStatus>,
  setLockedComputerUseEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(desktopIpc.setLockedComputerUseEnabled, enabled) as Promise<DesktopComputerUseStatus>,
  openComputerUsePrivacySettings: (pane: DesktopComputerUsePrivacyPane) =>
    ipcRenderer.invoke(desktopIpc.openComputerUsePrivacySettings, pane) as Promise<void>,
  onNotificationPermissionStatusChanged: (callback: (status: DesktopNotificationPermissionStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopNotificationPermissionStatus) => callback(status);
    ipcRenderer.on(desktopIpc.notificationPermissionStatusChanged, handler);
    return () => {
      ipcRenderer.removeListener(desktopIpc.notificationPermissionStatusChanged, handler);
    };
  },
  pickComposerAttachments: () => ipcRenderer.invoke(desktopIpc.pickComposerAttachments) as Promise<DesktopAppState>,
  readClipboardImageReference: () =>
    ipcRenderer.invoke(desktopIpc.readClipboardImageReference) as Promise<ComposerImageAttachment | null>,
  readNewThreadAttachmentPathReferences: (paths: readonly string[]) =>
    ipcRenderer.invoke(desktopIpc.readNewThreadAttachmentPathReferences, paths) as Promise<readonly ComposerAttachment[]>,
  pasteClipboardImageToComposer: () => ipcRenderer.invoke(desktopIpc.pasteClipboardImageToComposer) as Promise<DesktopAppState>,
  addComposerAttachmentPaths: (paths: readonly string[]) =>
    ipcRenderer.invoke(desktopIpc.addComposerAttachmentPaths, paths) as Promise<DesktopAppState>,
  addComposerAttachments: (attachments: readonly ComposerAttachment[]) =>
    ipcRenderer.invoke(desktopIpc.addComposerAttachments, attachments) as Promise<DesktopAppState>,
  removeComposerAttachment: (attachmentId: string) =>
    ipcRenderer.invoke(desktopIpc.removeComposerAttachment, attachmentId) as Promise<DesktopAppState>,
  editQueuedComposerMessage: (messageId: string, currentDraft?: string) =>
    ipcRenderer.invoke(desktopIpc.editQueuedComposerMessage, messageId, currentDraft) as Promise<DesktopAppState>,
  cancelQueuedComposerEdit: () =>
    ipcRenderer.invoke(desktopIpc.cancelQueuedComposerEdit) as Promise<DesktopAppState>,
  removeQueuedComposerMessage: (messageId: string) =>
    ipcRenderer.invoke(desktopIpc.removeQueuedComposerMessage, messageId) as Promise<DesktopAppState>,
  steerQueuedComposerMessage: (messageId: string) =>
    ipcRenderer.invoke(desktopIpc.steerQueuedComposerMessage, messageId) as Promise<DesktopAppState>,
  updateComposerDraft: (composerDraft: string) =>
    ipcRenderer.invoke(desktopIpc.updateComposerDraft, composerDraft) as Promise<DesktopAppState>,
  submitComposer: (text: string, options?: { readonly deliverAs?: "steer" | "followUp" }) =>
    ipcRenderer.invoke(desktopIpc.submitComposer, text, options) as Promise<DesktopAppState>,
  runDevelopmentOrchestration: () =>
    ipcRenderer.invoke(desktopIpc.runDevelopmentOrchestration) as Promise<DesktopAppState>,
  getSessionTree: (target: WorkspaceSessionTarget) =>
    ipcRenderer.invoke(desktopIpc.getSessionTree, target) as Promise<SessionTreeSnapshot>,
  navigateSessionTree: (target: WorkspaceSessionTarget, targetId: string, options?: NavigateSessionTreeOptions) =>
    ipcRenderer.invoke(desktopIpc.navigateSessionTree, target, targetId, options) as Promise<{
      readonly state: DesktopAppState;
      readonly result: NavigateSessionTreeResult;
    }>,
  listWorkspaceFiles: (workspaceId: string) =>
    ipcRenderer.invoke(desktopIpc.listWorkspaceFiles, workspaceId) as Promise<string[]>,
  getChangedFiles: (workspaceId: string) =>
    ipcRenderer.invoke(desktopIpc.getChangedFiles, workspaceId) as Promise<{ path: string; status: "added" | "modified" | "deleted" | "untracked"; staged: boolean }[]>,
  getFileDiff: (workspaceId: string, filePath: string) =>
    ipcRenderer.invoke(desktopIpc.getFileDiff, workspaceId, filePath) as Promise<string>,
  stageFile: (workspaceId: string, filePath: string) =>
    ipcRenderer.invoke(desktopIpc.stageFile, workspaceId, filePath) as Promise<void>,
  toggleWindowMaximize: () => ipcRenderer.invoke(desktopIpc.toggleWindowMaximize) as Promise<void>,
  openExternal: (url: string) => ipcRenderer.invoke(desktopIpc.openExternal, url) as Promise<void>,
  getThemeMode: () => ipcRenderer.invoke(desktopIpc.getThemeMode) as Promise<"system" | "light" | "dark">,
  getResolvedTheme: () => ipcRenderer.invoke(desktopIpc.getResolvedTheme) as Promise<"light" | "dark">,
  setThemeMode: (mode: "system" | "light" | "dark") =>
    ipcRenderer.invoke(desktopIpc.setThemeMode, mode) as Promise<string>,
  onThemeChanged: (callback: (theme: "light" | "dark") => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: "light" | "dark") => callback(theme);
    ipcRenderer.on(desktopIpc.themeChanged, handler);
    return () => {
      ipcRenderer.removeListener(desktopIpc.themeChanged, handler);
    };
  },
});

if (process.env.PI_APP_TEST_MODE) {
  const tones: string[] = [];
  contextBridge.exposeInMainWorld("__piTestHooks", {
    getTones: () => [...tones],
    clearTones: () => {
      tones.length = 0;
    },
    recordTone: (tone: string) => {
      tones.push(tone);
    },
  });
}
