import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type Dispatch, type DragEvent, type KeyboardEvent, type SetStateAction } from "react";
import type { SessionTreeSnapshot } from "@pi-gui/session-driver/types";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import {
  getSelectedSession,
  getSelectedWorkspace,
  type AppearanceThemeId,
  type AppView,
  type ComposerAttachment,
  type ComposerImageAttachment,
  type DesktopAppState,
  type NewThreadEnvironment,
  type NormalizedTranscriptView,
  type StartThreadInput,
  type TranscriptMessage,
} from "./desktop-state";
import { createDesktopClient } from "./desktop-client";
import { applyToolContentPatch, applyTranscriptDelta, mergeTranscriptRecordIntoView, orderedMessagesFromView } from "./transcript-view";
import { formatRelativeTime } from "./string-utils";
import { ComponentDock } from "./component-dock";
import { ComposerPanel } from "./composer-panel";
import { DevelopmentWorkflowSteps } from "./development-workflow-steps";
import { DiffPanel, type DiffPanelFileRequest } from "./diff-panel";
import { InlineDiff } from "./diff-inline";
import { buildModelOptions } from "./composer-commands";
import { parseTreeComposerCommand } from "./composer-commands";
import {
  desktopCommands,
  getDesktopCommandFromShortcut,
  getDesktopShortcutLabel,
  type DesktopComputerUsePrivacyPane,
  type DesktopComputerUseStatus,
  type DesktopNotificationPermissionStatus,
  type PiDesktopApi,
  type PiDesktopCommand,
  type ThirdPartyModelDiscoveryInput,
  type ThirdPartyModelProviderInput,
} from "./ipc";
import { deriveModelOnboardingState } from "./model-onboarding";
import { SkillsView } from "./skills-view";
import { ExtensionsView } from "./extensions-view";
import { SettingsView, type SettingsSection } from "./settings-view";
import { navigationItems } from "./settings-navigation";
import { NewThreadView } from "./new-thread-view";
import { buildRecentConversations } from "./conversation-collections";
import { buildThreadGroups } from "./thread-groups";
import { Sidebar } from "./sidebar";
import { SidebarToggleButton } from "./sidebar-toggle-button";
import { Topbar } from "./topbar";
import { TerminalPanel } from "./terminal-panel";
import { ConversationTimeline, VIRTUALIZATION_THRESHOLD } from "./conversation-timeline";
import { WebPreview } from "./web-preview";
import { useSlashMenu } from "./hooks/use-slash-menu";
import { useMentionMenu } from "./hooks/use-mention-menu";
import { useThreadSearch } from "./hooks/use-thread-search";
import { useWorkspaceMenu } from "./hooks/use-workspace-menu";
import { buildExtensionDockModel, ExtensionDialog, hasExtensionDockContent } from "./extension-session-ui";
import { TreeModal } from "./tree-modal";
import { getEffectiveModelRuntime } from "./model-settings";
import { resolveRepoWorkspaceId } from "./workspace-roots";
import { deriveWorkspaceContext } from "./workspace-context";
import {
  extractImageFilesFromClipboardData,
  extractFilesFromDataTransfer,
  readComposerAttachmentsFromFiles,
  resolveComposerFilePath,
} from "./composer-attachments";
import { playNotificationTone } from "./notification-sound";
import { extensionToLanguage } from "./syntax-highlight";

function useDesktopAppState() {
  const [snapshot, setSnapshot] = useState<DesktopAppState | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<NormalizedTranscriptView | null>(null);

  useEffect(() => {
    let active = true;
    const api = window.piApp;
    if (!api) {
      return undefined;
    }

    const client = createDesktopClient(api);

    void client.loadInitialState().then(({ state, selectedTranscript }) => {
      if (!active) {
        return;
      }
      setSnapshot(state);
      setSelectedTranscript(selectedTranscript);
    });

    const unsubscribeClient = client.subscribe((event) => {
      if (!active) return;
      switch (event.type) {
        case "state":
          setSnapshot(event.state);
          return;
        case "selectedTranscript":
          setSelectedTranscript((current) => (event.record ? mergeTranscriptRecordIntoView(current, event.record) : null));
          return;
        case "transcriptDelta":
          setSelectedTranscript((prev) => {
            if (!prev) return prev;
            return applyTranscriptDelta(prev, event.delta);
          });
          return;
      }
    });

    return () => {
      active = false;
      unsubscribeClient();
    };
  }, []);

  return [snapshot, setSnapshot, selectedTranscript, setSelectedTranscript] as const;
}

function updateSnapshot(
  api: NonNullable<typeof window.piApp>,
  setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
  action: () => Promise<DesktopAppState>,
) {
  return action().then((state) => {
    setSnapshot(state);
    return state;
  });
}

function isEventInsideTerminal(event: globalThis.KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof Element && Boolean(target.closest("[data-pi-terminal]"));
}

function canTogglePrimarySidebar(view: AppView | undefined): boolean {
  return view === "threads" || view === "new-thread" || view === "skills" || view === "extensions" || view === "settings";
}

function useRunningLabel(startedAt: string | undefined) {
  const [label, setLabel] = useState(() => formatRunningLabel(startedAt));

  useEffect(() => {
    setLabel(formatRunningLabel(startedAt));
    if (!startedAt) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setLabel(formatRunningLabel(startedAt));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [startedAt]);

  return label;
}

function formatRunningLabel(startedAt: string | undefined): string {
  if (!startedAt) {
    return "工作中…";
  }

  const diffMs = Math.max(0, Date.now() - Date.parse(startedAt));
  const seconds = Math.max(1, Math.floor(diffMs / 1000));
  if (seconds < 60) {
    return `已工作 ${seconds}秒`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `已工作 ${minutes}分` : `已工作 ${minutes}分 ${remaining}秒`;
}

export default function App() {
  const [snapshot, setSnapshot, selectedTranscript, setSelectedTranscript] = useDesktopAppState();
  const [composerDraft, setComposerDraft] = useState("");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState("");
  const [skillsWorkspaceId, setSkillsWorkspaceId] = useState("");
  const [extensionsWorkspaceId, setExtensionsWorkspaceId] = useState("");
  const [selectedSkillPath, setSelectedSkillPath] = useState<string | undefined>();
  const [selectedExtensionPath, setSelectedExtensionPath] = useState<string | undefined>("__background__");
  const [selectedDockComponentId, setSelectedDockComponentId] = useState<string | undefined>();
  const [pendingNewThreadWorkspaceId, setPendingNewThreadWorkspaceId] = useState("");
  const [newThreadRootWorkspaceId, setNewThreadRootWorkspaceId] = useState("");
  const [newThreadEnvironment, setNewThreadEnvironment] = useState<NewThreadEnvironment>("local");
  const [newThreadPrompt, setNewThreadPrompt] = useState("");
  const [newThreadAttachments, setNewThreadAttachments] = useState<readonly ComposerAttachment[]>([]);
  const [newThreadProvider, setNewThreadProvider] = useState<string | undefined>();
  const [newThreadModelId, setNewThreadModelId] = useState<string | undefined>();
  const [newThreadThinkingLevel, setNewThreadThinkingLevel] = useState<string | undefined>();
  const [newThreadComposerError, setNewThreadComposerError] = useState<string | undefined>();
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const appearanceTheme = snapshot?.appearanceTheme ?? "miku-dream";
  const appearanceThemes = snapshot?.appearanceThemes ?? [];
  const selectedAppearanceTheme = appearanceThemes.find((theme) => theme.id === appearanceTheme);
  const appearanceThemeVariableSignature = JSON.stringify(selectedAppearanceTheme?.variables ?? {});
  const appearanceHeroImageUrl = selectedAppearanceTheme?.heroImageUrl;
  const snapshotReady = snapshot !== null;
  const difyConfig = snapshot?.difyConfig;
  const cliTools = snapshot?.cliTools;  const [notificationPermissionStatus, setNotificationPermissionStatus] =
    useState<DesktopNotificationPermissionStatus>("unknown");
  const [notificationPermissionPending, setNotificationPermissionPending] = useState(false);
  const [computerUseStatus, setComputerUseStatus] = useState<DesktopComputerUseStatus | undefined>();
  const [computerUseStatusPending, setComputerUseStatusPending] = useState(false);
  const lastAudioEventRef = useRef("");
  const [dockExpandedBySession, setDockExpandedBySession] = useState<Record<string, boolean>>({});
  const [treeModalState, setTreeModalState] = useState<{
    readonly open: boolean;
    readonly loading: boolean;
    readonly submitting: boolean;
    readonly tree?: SessionTreeSnapshot;
    readonly error?: string;
  }>({
    open: false,
    loading: false,
    submitting: false,
  });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const newThreadComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const timelinePaneRef = useRef<HTMLDivElement | null>(null);
  const lastTranscriptMarkerRef = useRef("");
  const pinnedToBottomRef = useRef(true);
  const previousTimelinePaneSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lastTimelineScrollTopBySessionRef = useRef(new Map<string, number>());
  const lastTimelinePinnedBySessionRef = useRef(new Map<string, boolean>());
  const preserveBottomOnNextPaneResizeRef = useRef(false);
  const exactBottomRestoreSessionKeyRef = useRef<string | null>(null);
  const deferredPinnedBottomAlignmentRef = useRef(false);
  const pendingPinnedBottomBehaviorRef = useRef<ScrollBehavior>("auto");
  const previousActiveViewRef = useRef<AppView | null>(null);
  const hydratedComposerSessionKeyRef = useRef("");
  const handledComposerSyncNonceRef = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [openTerminalSessionKey, setOpenTerminalSessionKey] = useState("");
  const [takeoverTerminalSessionKey, setTakeoverTerminalSessionKey] = useState("");
  const [terminalHeight, setTerminalHeight] = useState(340);
  const [diffFileRequest, setDiffFileRequest] = useState<DiffPanelFileRequest | null>(null);
  const [centerDiffFile, setCenterDiffFile] = useState<string | null>(null);
  const [centerDiffText, setCenterDiffText] = useState("");
  const [centerDiffLoading, setCenterDiffLoading] = useState(false);
  const [timelinePaneMountVersion, setTimelinePaneMountVersion] = useState(0);
  const [disableTimelineVirtualization, setDisableTimelineVirtualization] = useState(true);
  const [isLoadingOlderTranscript, setIsLoadingOlderTranscript] = useState(false);
  const threadSearch = useThreadSearch(timelinePaneRef);
  const api = window.piApp;
  const sidebarToggleStateRef = useRef<{
    readonly api: typeof window.piApp;
    readonly activeView: AppView | undefined;
    readonly sidebarCollapsed: boolean;
  }>({
    api,
    activeView: undefined,
    sidebarCollapsed: false,
  });
  sidebarToggleStateRef.current = {
    api,
    activeView: snapshot?.activeView,
    sidebarCollapsed: snapshot?.sidebarCollapsed ?? false,
  };

  useEffect(() => {
    const piApi = window.piApp;
    if (!piApi) return;

    void piApi.getResolvedTheme().then(setResolvedTheme);

    void piApi.getThemeMode().then((mode) => {
      setThemeMode(mode);
    });

    return piApi.onThemeChanged(setResolvedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      appearanceTheme === "pi-native" && resolvedTheme === "dark",
    );
  }, [appearanceTheme, resolvedTheme]);

  useEffect(() => {
    if (!snapshot) return undefined;
    const root = document.documentElement;
    root.dataset.appearanceTheme = snapshot.appearanceTheme;
    const variables = selectedAppearanceTheme?.variables ?? {};
    const appliedVariables = Object.keys(variables);
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
    if (appearanceHeroImageUrl) {
      root.style.setProperty("--appearance-hero-image", `url("${appearanceHeroImageUrl}")`);
      appliedVariables.push("--appearance-hero-image");
    }
    return () => {
      for (const name of appliedVariables) {
        root.style.removeProperty(name);
      }
    };
  }, [appearanceTheme, appearanceThemeVariableSignature, appearanceHeroImageUrl, snapshotReady]);

  useEffect(() => {
    if (!snapshot) return;

    document.documentElement.classList.toggle("enable-transparency", snapshot.enableTransparency);
    const intensity = Math.max(0, Math.min(100, snapshot.backgroundGradientIntensity ?? 72));
    const primaryAlpha = intensity / 100;
    const alpha = (value: number) => String(Math.round(value * 100) / 100);
    document.documentElement.style.setProperty("--shell-gradient-primary-alpha", alpha(primaryAlpha));
    document.documentElement.style.setProperty("--shell-gradient-secondary-alpha", alpha(Math.max(0.2, primaryAlpha - 0.06)));
    document.documentElement.style.setProperty("--sidebar-panel-alpha", alpha(0.58 + primaryAlpha * 0.22));
    document.documentElement.style.setProperty("--main-panel-alpha", alpha(0.5 + primaryAlpha * 0.2));
    document.documentElement.style.setProperty("--topbar-panel-alpha", alpha(0.6 + primaryAlpha * 0.18));
  }, [snapshot?.backgroundGradientIntensity, snapshot?.enableTransparency]);

  useEffect(() => {
    const piApi = window.piApp;
    if (!piApi?.onNotificationPermissionStatusChanged) {
      return;
    }

    return piApi.onNotificationPermissionStatusChanged((status) => {
      setNotificationPermissionStatus(status);
    });
  }, []);

  const refreshNotificationPermissionStatus = useCallback(() => {
    if (!api?.getNotificationPermissionStatus) {
      return Promise.resolve("unknown" as DesktopNotificationPermissionStatus);
    }

    return api.getNotificationPermissionStatus().then((status) => {
      setNotificationPermissionStatus(status);
      return status;
    });
  }, [api]);

  useEffect(() => {
    if (snapshot?.activeView !== "settings" || settingsSection !== "notifications") {
      return undefined;
    }

    void refreshNotificationPermissionStatus();
    return undefined;
  }, [refreshNotificationPermissionStatus, settingsSection, snapshot?.activeView]);

  const refreshComputerUseStatus = useCallback(() => {
    if (!api?.getComputerUseStatus) {
      return Promise.resolve(undefined);
    }

    setComputerUseStatusPending(true);
    return api
      .getComputerUseStatus()
      .then((status) => {
        setComputerUseStatus(status);
        return status;
      })
      .finally(() => {
        setComputerUseStatusPending(false);
      });
  }, [api]);

  useEffect(() => {
    if (snapshot?.activeView !== "settings" || settingsSection !== "computer-use") {
      return undefined;
    }

    void refreshComputerUseStatus();
    return undefined;
  }, [refreshComputerUseStatus, settingsSection, snapshot?.activeView]);

  useEffect(() => {
    if (!snapshot?.notificationPreferences.soundEnabled) {
      return;
    }

    const selectedSessionKey = snapshot.selectedWorkspaceId && snapshot.selectedSessionId
      ? `${snapshot.selectedWorkspaceId}:${snapshot.selectedSessionId}`
      : "";
    const latestEvent = snapshot.lastSessionEvent;
    const selectedSessionUi = selectedSessionKey ? snapshot.sessionExtensionUiBySession[selectedSessionKey] : undefined;
    const pendingDialogs = selectedSessionUi?.pendingDialogs.length ?? 0;
    const toneKey = `${latestEvent?.kind ?? "none"}:${latestEvent?.workspaceId ?? ""}:${latestEvent?.sessionId ?? ""}:${latestEvent?.timestamp ?? ""}:${pendingDialogs}`;
    if (lastAudioEventRef.current === toneKey) {
      return;
    }

    if (latestEvent?.kind === "runFailed") {
      lastAudioEventRef.current = toneKey;
      void playNotificationTone("error");
      return;
    }

    if (latestEvent?.kind === "runCompleted") {
      lastAudioEventRef.current = toneKey;
      void playNotificationTone("complete");
      return;
    }

    if (latestEvent?.kind === "hostUiRequest" && `${latestEvent.workspaceId}:${latestEvent.sessionId}` === selectedSessionKey && pendingDialogs > 0) {
      lastAudioEventRef.current = toneKey;
      void playNotificationTone("attention");
    }
  }, [snapshot]);

  const {
    activeWorktrees,
    linkedWorktreeByWorkspaceId,
    rootWorkspace,
    rootWorkspaceOptions,
    selectedWorkspace,
    visibleWorkspaces,
  } = useMemo(() => deriveWorkspaceContext(snapshot), [snapshot]);
  const selectedSession = snapshot ? (getSelectedSession(snapshot) ?? selectedWorkspace?.sessions[0]) : undefined;
  const selectedRuntime = selectedWorkspace ? snapshot?.runtimeByWorkspace[selectedWorkspace.id] : undefined;
  const selectedModelRuntime = snapshot ? getEffectiveModelRuntime(snapshot, selectedWorkspace) : undefined;
  const selectedWorktree = selectedWorkspace ? linkedWorktreeByWorkspaceId.get(selectedWorkspace.id) : undefined;
  const settingsWorkspace = settingsWorkspaceId
    ? rootWorkspaceOptions.find((workspace) => workspace.id === settingsWorkspaceId)
    : undefined;
  const skillsWorkspace = skillsWorkspaceId
    ? rootWorkspaceOptions.find((workspace) => workspace.id === skillsWorkspaceId)
    : undefined;
  const extensionsWorkspace = extensionsWorkspaceId
    ? rootWorkspaceOptions.find((workspace) => workspace.id === extensionsWorkspaceId)
    : undefined;
  const settingsRuntime = settingsWorkspace ? snapshot?.runtimeByWorkspace[settingsWorkspace.id] : undefined;
  const settingsModelRuntime = snapshot ? getEffectiveModelRuntime(snapshot, settingsWorkspace) : undefined;
  const skillsRuntime = skillsWorkspace ? snapshot?.runtimeByWorkspace[skillsWorkspace.id] : undefined;
  const extensionsRuntime = extensionsWorkspace ? snapshot?.runtimeByWorkspace[extensionsWorkspace.id] : undefined;
  const extensionsCommandCompatibility = extensionsWorkspace
    ? snapshot?.extensionCommandCompatibilityByWorkspace[extensionsWorkspace.id] ?? []
    : [];
  const newThreadWorkspace =
    rootWorkspaceOptions.find((entry) => entry.id === newThreadRootWorkspaceId) ?? rootWorkspaceOptions[0];
  const newThreadRuntime = snapshot ? getEffectiveModelRuntime(snapshot, newThreadWorkspace) : undefined;
  const newThreadDefaultEnabled = buildModelOptions(newThreadRuntime).some(
    (m) => m.providerId === newThreadRuntime?.settings.defaultProvider && m.modelId === newThreadRuntime?.settings.defaultModelId,
  );
  const selectedDefaultEnabled = buildModelOptions(selectedModelRuntime).some(
    (m) => m.providerId === selectedModelRuntime?.settings.defaultProvider && m.modelId === selectedModelRuntime?.settings.defaultModelId,
  );
  const resolvedSessionProvider =
    selectedSession?.config?.provider ??
    (selectedDefaultEnabled ? selectedModelRuntime?.settings.defaultProvider : undefined);
  const resolvedSessionModelId =
    selectedSession?.config?.modelId ??
    (selectedDefaultEnabled ? selectedModelRuntime?.settings.defaultModelId : undefined);
  const resolvedSessionThinkingLevel =
    selectedSession?.config?.thinkingLevel ?? selectedModelRuntime?.settings.defaultThinkingLevel;
  const resolvedNewThreadProvider = newThreadProvider ?? (newThreadDefaultEnabled ? newThreadRuntime?.settings.defaultProvider : undefined);
  const resolvedNewThreadModelId = newThreadModelId ?? (newThreadDefaultEnabled ? newThreadRuntime?.settings.defaultModelId : undefined);
  const resolvedNewThreadThinkingLevel = newThreadThinkingLevel ?? newThreadRuntime?.settings.defaultThinkingLevel;
  const selectedSessionModelOnboarding = deriveModelOnboardingState(selectedModelRuntime, {
    provider: resolvedSessionProvider,
    modelId: resolvedSessionModelId,
  });
  const newThreadModelOnboarding = deriveModelOnboardingState(newThreadRuntime, {
    provider: resolvedNewThreadProvider,
    modelId: resolvedNewThreadModelId,
  });
  const [attachmentsClearedSessionKey, setAttachmentsClearedSessionKey] = useState<string | null>(null);
  const queuedComposerMessages = snapshot?.queuedComposerMessages ?? [];
  const editingQueuedMessageId = snapshot?.editingQueuedMessageId;
  const runningLabel = useRunningLabel(selectedSession?.status === "running" ? selectedSession.runningSince : undefined);
  const selectedSessionKey = selectedWorkspace && selectedSession ? `${selectedWorkspace.id}:${selectedSession.id}` : "";
  const composerAttachments = attachmentsClearedSessionKey === selectedSessionKey ? [] : (snapshot?.composerAttachments ?? []);
  const isTerminalVisibleForSelectedThread = Boolean(selectedSessionKey) && openTerminalSessionKey === selectedSessionKey;
  const isTerminalTakeoverForSelectedThread = Boolean(selectedSessionKey) && takeoverTerminalSessionKey === selectedSessionKey;
  const activeTranscript = useMemo(() => {
    if (
      selectedTranscript &&
      selectedWorkspace &&
      selectedSession &&
      selectedTranscript.workspaceId === selectedWorkspace.id &&
      selectedTranscript.sessionId === selectedSession.id
    ) {
      return orderedMessagesFromView(selectedTranscript);
    }
    return [];
  }, [selectedTranscript, selectedWorkspace?.id, selectedSession?.id]);
  const displayedTranscript = activeTranscript;
  const hasOlderMessages = Boolean(
    selectedTranscript &&
      selectedWorkspace &&
      selectedSession &&
      selectedTranscript.workspaceId === selectedWorkspace.id &&
      selectedTranscript.sessionId === selectedSession.id &&
      selectedTranscript.startIndex > 0,
  );
  const handleLoadOlderMessages = useCallback(() => {
    if (!api || !selectedTranscript || isLoadingOlderTranscript || selectedTranscript.startIndex <= 0) {
      return;
    }
    const limit = Math.min(100, selectedTranscript.startIndex);
    const startIndex = Math.max(0, selectedTranscript.startIndex - limit);
    setIsLoadingOlderTranscript(true);
    const client = createDesktopClient(api);
    const request = {
      workspaceId: selectedTranscript.workspaceId,
      sessionId: selectedTranscript.sessionId,
      startIndex,
      limit,
    };
    void client.fetchTranscriptWindow(request).then((record) => {
      if (!record) return;
      setSelectedTranscript((current) => {
        if (!current || current.workspaceId !== request.workspaceId || current.sessionId !== request.sessionId) {
          return current;
        }
        return mergeTranscriptRecordIntoView(current, record);
      });
    }).finally(() => {
      setIsLoadingOlderTranscript(false);
    });
  }, [api, isLoadingOlderTranscript, selectedTranscript, setSelectedTranscript]);
  const isTranscriptLoading = Boolean(selectedSession) && activeTranscript.length === 0 && (
    !selectedTranscript ||
    selectedTranscript.workspaceId !== selectedWorkspace?.id ||
    selectedTranscript.sessionId !== selectedSession?.id
  );
  const handleExpandToolCall = useCallback((callId: string) => {
    if (!api || !selectedTranscript) {
      return;
    }
    const existing = Object.values(selectedTranscript.messagesById).find(
      (message) => message.kind === "tool" && message.callId === callId,
    );
    if (!existing || existing.kind !== "tool" || (!existing.inputOmitted && !existing.outputOmitted)) {
      return;
    }
    const client = createDesktopClient(api);
    const request = {
      workspaceId: selectedTranscript.workspaceId,
      sessionId: selectedTranscript.sessionId,
      callId,
    };
    void client.fetchToolContent(request).then((tool) => {
      if (!tool) return;
      setSelectedTranscript((current) => {
        if (!current || current.workspaceId !== request.workspaceId || current.sessionId !== request.sessionId) {
          return current;
        }
        return applyToolContentPatch(current, tool);
      });
    });
  }, [api, selectedTranscript, setSelectedTranscript]);
  const selectedSessionCommands = selectedSession ? snapshot?.sessionCommandsBySession[selectedSessionKey] ?? [] : [];
  const selectedExtensionUi = selectedSession ? snapshot?.sessionExtensionUiBySession[selectedSessionKey] : undefined;
  const selectedWorkspaceCommandCompatibility = selectedWorkspace
    ? snapshot?.extensionCommandCompatibilityByWorkspace[selectedWorkspace.id] ?? []
    : [];
  useEffect(() => {
    if (snapshot && snapshot.workspaces.length === 0) {
      setOpenTerminalSessionKey("");
      setTakeoverTerminalSessionKey("");
    }
  }, [snapshot]);
  useEffect(() => {
    setOpenTerminalSessionKey("");
    setTakeoverTerminalSessionKey("");
  }, [selectedSessionKey]);
  const selectedExtensionDock = useMemo(() => buildExtensionDockModel(selectedExtensionUi), [selectedExtensionUi]);
  const displayedSessionTitle = selectedExtensionUi?.title ?? selectedSession?.title ?? "";
  const activeExtensionDialog = selectedExtensionUi?.pendingDialogs[0];
  const isSelectedExtensionDockExpanded = dockExpandedBySession[selectedSessionKey] ?? false;
  const persistedComposerDraft = snapshot?.composerDraft ?? "";
  const threadGroups = useMemo(
    () => (snapshot ? buildThreadGroups(snapshot) : []),
    [snapshot?.workspaces, snapshot?.worktreesByWorkspace, snapshot?.workspaceOrder],
  );
  const recentConversations = useMemo(
    () => (snapshot ? buildRecentConversations(snapshot) : []),
    [snapshot?.workspaces],
  );

  // Derive agent sub-state from transcript content
  const lastTranscriptItem = activeTranscript[activeTranscript.length - 1];
  const hasRunningTool = activeTranscript.some(
    (item) => item.kind === "tool" && item.status === "running",
  );
  const isAssistantStreaming =
    lastTranscriptItem?.kind === "message" && lastTranscriptItem?.role === "assistant";
  const isAgentThinking = selectedSession?.status === "running" && isAssistantStreaming && !hasRunningTool;
  const isAgentExecuting = selectedSession?.status === "running" && hasRunningTool;
  const isAgentProcessingInput = selectedSession?.status === "running" && queuedComposerMessages.length > 0;
  const agentStatusLabel = isAgentExecuting
    ? runningLabel
    : isAgentThinking
      ? "思考中…"
      : isAgentProcessingInput
        ? "处理输入…"
        : selectedSession?.status === "running"
          ? runningLabel
          : undefined;

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  };
  const toggleTerminal = useCallback(() => {
    if (!selectedSessionKey) {
      return;
    }
    if (openTerminalSessionKey === selectedSessionKey) {
      setOpenTerminalSessionKey("");
      setTakeoverTerminalSessionKey("");
      return;
    }
    setOpenTerminalSessionKey(selectedSessionKey);
  }, [openTerminalSessionKey, selectedSessionKey]);
  const focusNewThreadComposer = () => {
    window.requestAnimationFrame(() => {
      newThreadComposerRef.current?.focus();
    });
  };
  const resetExactBottomRestoreState = (nextSessionKey: string | null = null) => {
    exactBottomRestoreSessionKeyRef.current = nextSessionKey;
    deferredPinnedBottomAlignmentRef.current = false;
    pendingPinnedBottomBehaviorRef.current = "auto";
  };
  const updateNewThreadPrompt = useCallback((value: SetStateAction<string>) => {
    setNewThreadComposerError(undefined);
    setNewThreadPrompt(value);
  }, []);
  const scrollTimelineToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const pane = timelinePaneRef.current;
    if (!pane) {
      return;
    }

    const align = (remainingChecks: number) => {
      if (behavior === "auto") {
        const previousScrollBehavior = pane.style.scrollBehavior;
        pane.style.scrollBehavior = "auto";
        pane.scrollTop = pane.scrollHeight;
        pane.style.scrollBehavior = previousScrollBehavior;
      } else {
        pane.scrollTo({ top: pane.scrollHeight, behavior });
      }
      pinnedToBottomRef.current = true;
      lastTimelineScrollTopBySessionRef.current.set(selectedSessionKey, pane.scrollTop);
      lastTimelinePinnedBySessionRef.current.set(selectedSessionKey, true);
      setShowJumpToLatest(false);

      if (remainingChecks <= 0) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (!pinnedToBottomRef.current && !preserveBottomOnNextPaneResizeRef.current) {
          return;
        }
        const remaining = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
        if (remaining > 1 || remainingChecks > 1) {
          align(remainingChecks - 1);
        }
      });
    };

    align(6);
  }, [selectedSessionKey]);

  const requestPinnedBottomAlignment = useCallback((
    behavior: ScrollBehavior = "auto",
    options?: { readonly preferExactRestore?: boolean },
  ) => {
    if (exactBottomRestoreSessionKeyRef.current === selectedSessionKey && selectedSessionKey) {
      pendingPinnedBottomBehaviorRef.current = behavior;
      deferredPinnedBottomAlignmentRef.current = true;
      return;
    }

    if (options?.preferExactRestore && selectedSessionKey && activeTranscript.length > VIRTUALIZATION_THRESHOLD) {
      exactBottomRestoreSessionKeyRef.current = selectedSessionKey;
      pendingPinnedBottomBehaviorRef.current = behavior;
      preserveBottomOnNextPaneResizeRef.current = true;
      setDisableTimelineVirtualization(true);
      return;
    }

    scrollTimelineToBottom(behavior);
  }, [activeTranscript.length, scrollTimelineToBottom, selectedSessionKey]);

  const finalizeTimelineVirtualizationDisable = useCallback(() => {
    const pane = timelinePaneRef.current;
    const restoreSessionKey = exactBottomRestoreSessionKeyRef.current;
    if (!pane || snapshot?.activeView !== "threads") {
      resetExactBottomRestoreState();
      setDisableTimelineVirtualization(false);
      return;
    }

    if (restoreSessionKey !== selectedSessionKey || !restoreSessionKey) {
      setDisableTimelineVirtualization(false);
      return;
    }

    const shouldRestoreBottom =
      pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current || deferredPinnedBottomAlignmentRef.current;
    if (!shouldRestoreBottom) {
      resetExactBottomRestoreState();
      setDisableTimelineVirtualization(false);
      return;
    }

    const finishRestore = (remainingChecks: number, stableChecks: number) => {
      window.requestAnimationFrame(() => {
        if (timelinePaneRef.current !== pane || exactBottomRestoreSessionKeyRef.current !== restoreSessionKey) {
          return;
        }

        if (pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current) {
          scrollTimelineToBottom();
        }

        const remaining = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
        const nextStableChecks = remaining <= 16 ? stableChecks + 1 : 0;
        if (remainingChecks <= 1 || nextStableChecks >= 2) {
          const shouldApplyDeferredAlignment = deferredPinnedBottomAlignmentRef.current;
          resetExactBottomRestoreState();
          if (shouldApplyDeferredAlignment) {
            scrollTimelineToBottom();
          }
          preserveBottomOnNextPaneResizeRef.current = false;
          return;
        }

        finishRestore(remainingChecks - 1, nextStableChecks);
      });
    };

    if (pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current) {
      scrollTimelineToBottom();
    }

    window.requestAnimationFrame(() => {
      if (timelinePaneRef.current !== pane || exactBottomRestoreSessionKeyRef.current !== restoreSessionKey) {
        return;
      }
      setDisableTimelineVirtualization(false);
      scrollTimelineToBottom(pendingPinnedBottomBehaviorRef.current);
      pendingPinnedBottomBehaviorRef.current = "auto";
      finishRestore(6, 0);
    });
  }, [scrollTimelineToBottom, selectedSessionKey, snapshot?.activeView]);

  const setTimelinePaneElement = useCallback((node: HTMLDivElement | null) => {
    timelinePaneRef.current = node;
    if (!node) {
      return;
    }

    setTimelinePaneMountVersion((current) => current + 1);

    const savedPinned = lastTimelinePinnedBySessionRef.current.get(selectedSessionKey);
    const savedScrollTop = lastTimelineScrollTopBySessionRef.current.get(selectedSessionKey);

    if (!selectedSessionKey || snapshot?.activeView !== "threads") {
      setDisableTimelineVirtualization(false);
      return;
    }

    const shouldRestoreBottom = (savedPinned ?? pinnedToBottomRef.current) || preserveBottomOnNextPaneResizeRef.current;
    if (shouldRestoreBottom) {
      preserveBottomOnNextPaneResizeRef.current = true;
      node.scrollTop = node.scrollHeight;
      window.requestAnimationFrame(() => {
        if (timelinePaneRef.current !== node) {
          return;
        }
        if (pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current) {
          requestPinnedBottomAlignment("auto", { preferExactRestore: true });
        }
      });
      return;
    }

    if (savedScrollTop == null) {
      setDisableTimelineVirtualization(false);
      return;
    }

    node.scrollTop = savedScrollTop;
    pinnedToBottomRef.current = false;
    resetExactBottomRestoreState();
    lastTimelinePinnedBySessionRef.current.set(selectedSessionKey, false);
    window.requestAnimationFrame(() => {
      if (timelinePaneRef.current !== node) {
        return;
      }
      setDisableTimelineVirtualization(false);
    });
  }, [scrollTimelineToBottom, selectedSessionKey, snapshot?.activeView]);

  const schedulePinnedBottomRealignment = useCallback((delayFrames = 0) => {
    const waitForFrames = (remainingFrames: number) => {
      window.requestAnimationFrame(() => {
        if (remainingFrames > 0) {
          waitForFrames(remainingFrames - 1);
          return;
        }
        requestPinnedBottomAlignment("auto", { preferExactRestore: true });
        window.requestAnimationFrame(() => {
          preserveBottomOnNextPaneResizeRef.current = false;
          if (pinnedToBottomRef.current) {
            requestPinnedBottomAlignment("auto", { preferExactRestore: true });
          }
        });
      });
    };

    waitForFrames(delayFrames);
  }, [requestPinnedBottomAlignment]);

  const handleViewFileInDiff = useCallback((path: string) => {
    setShowDiffPanel(true);
    setDiffFileRequest({ path, nonce: Date.now() });
  }, []);

  const handleSelectDiffFile = useCallback((path: string | null) => {
    setCenterDiffFile(path);
  }, []);

  useEffect(() => {
    setCenterDiffFile(null);
    setCenterDiffText("");
  }, [selectedSessionKey]);

  useEffect(() => {
    if (!showDiffPanel) {
      setCenterDiffFile(null);
      setCenterDiffText("");
      setCenterDiffLoading(false);
    }
  }, [showDiffPanel]);

  useEffect(() => {
    if (!api || !selectedWorkspace?.id || !centerDiffFile || !showDiffPanel) {
      setCenterDiffText("");
      setCenterDiffLoading(false);
      return undefined;
    }

    let active = true;
    setCenterDiffLoading(true);
    void api
      .getFileDiff(selectedWorkspace.id, centerDiffFile)
      .then((diff) => {
        if (active) {
          setCenterDiffText(diff);
        }
      })
      .catch((error) => {
        if (active) {
          const message = error instanceof Error ? error.message : String(error);
          setCenterDiffText(`无法加载 diff：${message}`);
        }
      })
      .finally(() => {
        if (active) {
          setCenterDiffLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, centerDiffFile, selectedWorkspace?.id, showDiffPanel]);

  const toggleDiffPanel = useCallback(() => {
    const pane = timelinePaneRef.current;
    const shouldPreserveBottom = pane ? isNearBottom(pane) || pinnedToBottomRef.current : pinnedToBottomRef.current;
    if (shouldPreserveBottom) {
      preserveBottomOnNextPaneResizeRef.current = true;
    }

    setShowDiffPanel((prev) => !prev);

    if (!shouldPreserveBottom) {
      return;
    }

    schedulePinnedBottomRealignment(3);
  }, [schedulePinnedBottomRealignment]);

  const openSettings = (workspaceId?: string, section?: SettingsSection) => {
    if (!api) {
      return;
    }
    const nextWorkspaceId =
      workspaceId && rootWorkspaceOptions.some((workspace) => workspace.id === workspaceId)
        ? workspaceId
        : settingsWorkspace?.id || rootWorkspaceOptions[0]?.id || "";
    if (nextWorkspaceId) {
      setSettingsWorkspaceId(nextWorkspaceId);
    }
    if (section) {
      setSettingsSection(section);
    }
    void updateSnapshot(api, setSnapshot, () => api.setActiveView("settings"));
  };

  const closeTreeModal = useCallback(() => {
    setTreeModalState((current) =>
      current.submitting
        ? current
        : {
            open: false,
            loading: false,
            submitting: false,
          },
    );
    focusComposer();
  }, []);

  const openTreeModal = useCallback(() => {
    if (!api || !selectedWorkspace || !selectedSession) {
      return;
    }

    setTreeModalState({
      open: true,
      loading: true,
      submitting: false,
    });
    setComposerDraft("");

    void api
      .getSessionTree({
        workspaceId: selectedWorkspace.id,
        sessionId: selectedSession.id,
      })
      .then((tree) => {
        setTreeModalState({
          open: true,
          loading: false,
          submitting: false,
          tree,
        });
      })
      .catch((error) => {
        setTreeModalState({
          open: true,
          loading: false,
          submitting: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [api, selectedSession, selectedWorkspace]);

  const navigateTreeSelection = useCallback(
    (targetId: string, options?: { readonly summarize?: boolean; readonly customInstructions?: string }) => {
      if (!api || !selectedWorkspace || !selectedSession) {
        return;
      }

      setTreeModalState((current) => ({ ...current, submitting: true, error: undefined }));
      void api
        .navigateSessionTree(
          {
            workspaceId: selectedWorkspace.id,
            sessionId: selectedSession.id,
          },
          targetId,
          options,
        )
        .then(({ state, result }) => {
          setSnapshot(state);
          setTreeModalState({
            open: false,
            loading: false,
            submitting: false,
          });
          setComposerDraft((current) =>
            !current.trim() && result.editorText ? result.editorText : state.composerDraft,
          );
          focusComposer();
        })
        .catch((error) => {
          setTreeModalState((current) => ({
            ...current,
            submitting: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        });
    },
    [api, selectedSession, selectedWorkspace],
  );

  const slashMenu = useSlashMenu({
    composerDraft,
    setComposerDraft,
    selectedRuntime,
    selectedModelRuntime,
    sessionCommands: selectedSessionCommands,
    commandCompatibility: selectedWorkspaceCommandCompatibility,
    selectedSessionKey,
    selectedSession,
    selectedWorkspace,
    isRunning: selectedSession?.status === "running",
    api,
    setSnapshot,
    focusComposer,
    openSettings,
    updateSnapshot,
    allowTreeCommand: true,
    onRunTreeCommand: openTreeModal,
  });

  const enableSelectedMentionExtension = useCallback(
    (filePath: string) => {
      if (!api || !selectedWorkspace) {
        return Promise.resolve();
      }
      return updateSnapshot(api, setSnapshot, () => api.setExtensionEnabled(selectedWorkspace.id, filePath, true)).then(
        () => undefined,
      );
    },
    [api, selectedWorkspace],
  );

  const mentionMenu = useMentionMenu({
    composerDraft,
    setComposerDraft,
    composerRef,
    workspaceId: selectedWorkspace?.id,
    runtime: selectedRuntime,
    api,
    onEnableExtension: enableSelectedMentionExtension,
  });

  const newThreadSlashMenu = useSlashMenu({
    composerDraft: newThreadPrompt,
    setComposerDraft: updateNewThreadPrompt,
    selectedRuntime: newThreadRuntime,
    selectedModelRuntime: newThreadRuntime,
    sessionCommands: [],
    commandCompatibility: [],
    selectedSessionKey: `new-thread:${newThreadWorkspace?.id ?? ""}`,
    selectedSession: undefined,
    selectedWorkspace: newThreadWorkspace,
    isRunning: false,
    api,
    setSnapshot,
    focusComposer: focusNewThreadComposer,
    openSettings,
    updateSnapshot,
    allowTreeCommand: false,
    immediateCommandMode: "prefill",
    onSelectModelOption: (provider, modelId) => {
      setNewThreadProvider(provider);
      setNewThreadModelId(modelId);
    },
    onSelectThinkingOption: setNewThreadThinkingLevel,
    onSelectLoginProvider: (providerId) => {
      if (!api || !newThreadWorkspace) {
        return;
      }
      void updateSnapshot(api, setSnapshot, () => api.loginProvider(newThreadWorkspace.id, providerId));
    },
    onSelectLogoutProvider: (providerId) => {
      if (!api || !newThreadWorkspace) {
        return;
      }
      void updateSnapshot(api, setSnapshot, () => api.logoutProvider(newThreadWorkspace.id, providerId));
    },
  });

  const enableNewThreadMentionExtension = useCallback(
    (filePath: string) => {
      if (!api || !newThreadWorkspace) {
        return Promise.resolve();
      }
      return updateSnapshot(api, setSnapshot, () => api.setExtensionEnabled(newThreadWorkspace.id, filePath, true)).then(
        () => undefined,
      );
    },
    [api, newThreadWorkspace],
  );

  const newThreadMentionMenu = useMentionMenu({
    composerDraft: newThreadPrompt,
    setComposerDraft: setNewThreadPrompt,
    composerRef: newThreadComposerRef,
    workspaceId: newThreadWorkspace?.id,
    runtime: newThreadRuntime,
    api,
    onEnableExtension: enableNewThreadMentionExtension,
  });

  const wsMenu = useWorkspaceMenu({
    api,
    setSnapshot,
    updateSnapshot,
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (hydratedComposerSessionKeyRef.current !== selectedSessionKey) {
      hydratedComposerSessionKeyRef.current = selectedSessionKey;
      handledComposerSyncNonceRef.current = snapshot.composerDraftSyncNonce;
      setComposerDraft(snapshot.composerDraft);
      return;
    }

    if (snapshot.composerDraftSyncNonce === handledComposerSyncNonceRef.current) {
      return;
    }

    handledComposerSyncNonceRef.current = snapshot.composerDraftSyncNonce;
    if (snapshot.composerDraftSyncSource === "persist" || snapshot.composerDraftSyncSource === "state") {
      return;
    }

    setComposerDraft(snapshot.composerDraft);
  }, [
    selectedSessionKey,
    snapshot?.composerDraft,
    snapshot?.composerDraftSyncNonce,
    snapshot?.composerDraftSyncSource,
  ]);

  useEffect(() => {
    const sessionExtensionUiBySession = snapshot?.sessionExtensionUiBySession;
    if (!sessionExtensionUiBySession) {
      setDockExpandedBySession((current) => (Object.keys(current).length > 0 ? {} : current));
      return;
    }

    setDockExpandedBySession((current) => {
      let next: Record<string, boolean> | undefined;
      for (const [sessionKey, expanded] of Object.entries(current)) {
        if (!expanded && sessionExtensionUiBySession[sessionKey]) {
          continue;
        }
        if (hasExtensionDockContent(sessionExtensionUiBySession[sessionKey])) {
          continue;
        }
        if (!next) {
          next = { ...current };
        }
        delete next[sessionKey];
      }
      return next ?? current;
    });
  }, [snapshot?.sessionExtensionUiBySession]);

  useEffect(() => {
    if (rootWorkspaceOptions.length === 0) {
      setSettingsWorkspaceId("");
      setSkillsWorkspaceId("");
      setExtensionsWorkspaceId("");
      setPendingNewThreadWorkspaceId("");
      setNewThreadRootWorkspaceId("");
      setNewThreadEnvironment("local");
      setNewThreadAttachments([]);
      return;
    }
    setSettingsWorkspaceId((current) =>
      rootWorkspaceOptions.some((workspace) => workspace.id === current) ? current : (current || rootWorkspaceOptions[0]?.id || ""),
    );
    setSkillsWorkspaceId((current) =>
      rootWorkspaceOptions.some((workspace) => workspace.id === current) ? current : (current || rootWorkspaceOptions[0]?.id || ""),
    );
    setExtensionsWorkspaceId((current) =>
      rootWorkspaceOptions.some((workspace) => workspace.id === current) ? current : (current || rootWorkspaceOptions[0]?.id || ""),
    );
    setNewThreadRootWorkspaceId((current) =>
      rootWorkspaceOptions.some((workspace) => workspace.id === current) ? current : (current || rootWorkspaceOptions[0]?.id || ""),
    );
  }, [rootWorkspaceOptions]);

  useEffect(() => {
    if (!snapshot || !pendingNewThreadWorkspaceId) {
      return;
    }
    const nextRootWorkspaceId = resolveRepoWorkspaceId(snapshot.workspaces, pendingNewThreadWorkspaceId);
    if (!nextRootWorkspaceId || !rootWorkspaceOptions.some((workspace) => workspace.id === nextRootWorkspaceId)) {
      return;
    }
    setNewThreadRootWorkspaceId(nextRootWorkspaceId);
    setPendingNewThreadWorkspaceId("");
  }, [pendingNewThreadWorkspaceId, rootWorkspaceOptions, snapshot]);

  const resetNewThreadSurface = (workspaceId?: string) => {
    const nextWorkspaceId =
      (workspaceId && (
        rootWorkspaceOptions.find((workspace) => workspace.id === workspaceId)?.id ||
        (snapshot ? resolveRepoWorkspaceId(snapshot.workspaces, workspaceId) : undefined)
      )) ||
      rootWorkspace?.id ||
      visibleWorkspaces[0]?.id ||
      "";
    if (nextWorkspaceId) {
      setNewThreadRootWorkspaceId(nextWorkspaceId);
    }
    setNewThreadEnvironment("local");
    setNewThreadPrompt("");
    setNewThreadAttachments([]);
    setNewThreadProvider(undefined);
    setNewThreadModelId(undefined);
    setNewThreadThinkingLevel(undefined);
    setNewThreadComposerError(undefined);
  };

  const primarySidebarToggleVisible = canTogglePrimarySidebar(snapshot?.activeView);
  const handleTogglePrimarySidebar = useCallback(() => {
    const sidebarState = sidebarToggleStateRef.current;
    const sidebarApi = sidebarState.api;
    if (!sidebarApi || !canTogglePrimarySidebar(sidebarState.activeView)) {
      return false;
    }
    void updateSnapshot(sidebarApi, setSnapshot, () => sidebarApi.setSidebarCollapsed(!sidebarState.sidebarCollapsed));
    return true;
  }, []);
  const sidebarToggleShortcutLabel = api ? getDesktopShortcutLabel(api.platform, "B") : "";

  useEffect(() => {
    const handleCommand = (command: PiDesktopCommand): boolean => {
      if (command === desktopCommands.openSettings) {
        openSettings(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id);
        return true;
      } else if (command === desktopCommands.openNewThread) {
        openNewThreadSurface(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id);
        return true;
      } else if (command === desktopCommands.toggleTerminal) {
        toggleTerminal();
        return true;
      } else if (command === desktopCommands.toggleSidebar) {
        return handleTogglePrimarySidebar();
      }
      return false;
    };

    const removeCommandListener = window.piApp?.onCommand?.(handleCommand);
    const removeWorkspacePickedListener = window.piApp?.onWorkspacePicked?.((workspaceId) => {
      setPendingNewThreadWorkspaceId(workspaceId);
      resetNewThreadSurface();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEventInsideTerminal(event)) {
        const command = getDesktopCommandFromShortcut({
          modifier: event.metaKey || event.ctrlKey,
          shift: event.shiftKey,
          key: event.key,
          code: event.code,
        });
        if (command === desktopCommands.toggleTerminal) {
          event.preventDefault();
          handleCommand(command);
        }
        return;
      }
      // Cmd+F toggles thread search
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && !event.shiftKey) {
        event.preventDefault();
        if (threadSearch.isOpen) {
          threadSearch.close();
        } else {
          threadSearch.open();
        }
        return;
      }
      // Cmd+D toggles diff panel
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && !event.shiftKey) {
        event.preventDefault();
        toggleDiffPanel();
        return;
      }
      const command = getDesktopCommandFromShortcut({
        modifier: event.metaKey || event.ctrlKey,
        shift: event.shiftKey,
        key: event.key,
        code: event.code,
      });
      if (command && handleCommand(command)) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      removeCommandListener?.();
      removeWorkspacePickedListener?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedWorkspace?.id,
    selectedWorkspace?.rootWorkspaceId,
    threadSearch,
    api,
    toggleDiffPanel,
    toggleTerminal,
    handleTogglePrimarySidebar,
  ]);

  useLayoutEffect(() => {
    setShowJumpToLatest(false);
    lastTranscriptMarkerRef.current = "";
    pinnedToBottomRef.current = true;
    previousTimelinePaneSizeRef.current = null;
    preserveBottomOnNextPaneResizeRef.current = false;
    resetExactBottomRestoreState(selectedSessionKey || null);
    setDisableTimelineVirtualization(Boolean(selectedSessionKey));
  }, [selectedSessionKey]);

  useLayoutEffect(() => {
    if (snapshot?.activeView !== "threads" || !selectedSession || activeTranscript.length === 0) {
      return;
    }
    if (exactBottomRestoreSessionKeyRef.current !== selectedSessionKey) {
      return;
    }
    if (!pinnedToBottomRef.current && !preserveBottomOnNextPaneResizeRef.current) {
      return;
    }

    scrollTimelineToBottom();
  }, [
    activeTranscript,
    disableTimelineVirtualization,
    scrollTimelineToBottom,
    selectedSession,
    selectedSessionKey,
    snapshot?.activeView,
  ]);

  useEffect(() => {
    setTreeModalState((current) =>
      current.open
        ? {
            open: false,
            loading: false,
            submitting: false,
          }
        : current,
    );
  }, [selectedSessionKey, snapshot?.activeView]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (snapshot.activeView === "new-thread" && previousActiveViewRef.current !== "new-thread") {
      const nextRootWorkspaceId = resolveRepoWorkspaceId(snapshot.workspaces, selectedWorkspace?.id);
      if (nextRootWorkspaceId) {
        setNewThreadRootWorkspaceId(nextRootWorkspaceId);
      }
    }

    if (snapshot.activeView !== "threads") {
      previousTimelinePaneSizeRef.current = null;
      resetExactBottomRestoreState();
    }

    if (
      snapshot.activeView === "threads" &&
      previousActiveViewRef.current !== "threads" &&
      selectedSession
    ) {
      focusComposer();
      if (pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current) {
        preserveBottomOnNextPaneResizeRef.current = true;
        schedulePinnedBottomRealignment(1);
      }
    }

    previousActiveViewRef.current = snapshot.activeView;
  }, [schedulePinnedBottomRealignment, selectedSession, selectedWorkspace?.id, snapshot]);

  useEffect(() => {
    if (!api || composerDraft === persistedComposerDraft) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void api.updateComposerDraft(composerDraft);
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [api, composerDraft, persistedComposerDraft, setSnapshot]);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return undefined;
    }

    const pane = timelinePaneRef.current;
    const previousHeight = composer.getBoundingClientRect().height;
    const shouldPreserveBottom = pane
      ? isNearBottom(pane) || pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current
      : pinnedToBottomRef.current || preserveBottomOnNextPaneResizeRef.current;

    composer.style.height = "0px";
    composer.style.height = `${Math.min(composer.scrollHeight, 220)}px`;

    const nextHeight = composer.getBoundingClientRect().height;
    if (Math.abs(nextHeight - previousHeight) >= 1 && shouldPreserveBottom) {
      preserveBottomOnNextPaneResizeRef.current = true;
      requestPinnedBottomAlignment("auto", { preferExactRestore: true });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          preserveBottomOnNextPaneResizeRef.current = false;
          if (pinnedToBottomRef.current) {
            requestPinnedBottomAlignment("auto", { preferExactRestore: true });
          }
        });
      });
    }
  }, [composerDraft, requestPinnedBottomAlignment]);

  useLayoutEffect(() => {
    if (snapshot?.activeView !== "threads" || !selectedSession) {
      return undefined;
    }

    return () => {
      const pane = timelinePaneRef.current;
      if (!pane) {
        return;
      }
      lastTimelineScrollTopBySessionRef.current.set(selectedSessionKey, pane.scrollTop);
      lastTimelinePinnedBySessionRef.current.set(selectedSessionKey, isNearBottom(pane));
    };
  }, [selectedSession, selectedSessionKey, snapshot?.activeView]);

  useLayoutEffect(() => {
    const pane = timelinePaneRef.current;
    if (!pane || !selectedSession || snapshot?.activeView !== "threads") {
      previousTimelinePaneSizeRef.current = null;
      return undefined;
    }

    const stickToBottomAfterLayoutChange = () => {
      preserveBottomOnNextPaneResizeRef.current = false;
      pinnedToBottomRef.current = true;
      window.requestAnimationFrame(() => {
        requestPinnedBottomAlignment("auto", { preferExactRestore: true });
        window.requestAnimationFrame(() => {
          if (pinnedToBottomRef.current) {
            requestPinnedBottomAlignment("auto", { preferExactRestore: true });
          }
        });
      });
    };

    const updateMeasuredSize = (nextSize: { width: number; height: number }) => {
      const previousSize = previousTimelinePaneSizeRef.current;
      previousTimelinePaneSizeRef.current = nextSize;
      const shouldStickToBottom = preserveBottomOnNextPaneResizeRef.current || pinnedToBottomRef.current;
      const widthChanged = previousSize ? Math.abs(nextSize.width - previousSize.width) >= 1 : false;
      const heightChanged = previousSize ? Math.abs(nextSize.height - previousSize.height) >= 1 : false;
      if (!previousSize || (!widthChanged && !heightChanged) || !shouldStickToBottom) {
        return;
      }

      stickToBottomAfterLayoutChange();
    };

    const paneRect = pane.getBoundingClientRect();
    updateMeasuredSize({ width: paneRect.width, height: paneRect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateMeasuredSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    resizeObserver.observe(pane);
    return () => {
      resizeObserver.disconnect();
      previousTimelinePaneSizeRef.current = null;
    };
  }, [requestPinnedBottomAlignment, selectedSessionKey, showDiffPanel, snapshot?.activeView, timelinePaneMountVersion]);

  useEffect(() => {
    const pane = timelinePaneRef.current;
    if (!pane || !selectedSession) {
      return;
    }

    const marker = buildTranscriptChangeMarker(selectedSessionKey, activeTranscript);
    if (marker === lastTranscriptMarkerRef.current) {
      return;
    }
    lastTranscriptMarkerRef.current = marker;

    if (pinnedToBottomRef.current) {
      requestPinnedBottomAlignment("auto", { preferExactRestore: true });
      return;
    }

    setShowJumpToLatest(true);
  }, [activeTranscript, requestPinnedBottomAlignment, selectedSession, selectedSessionKey]);

  const handleTimelineContentHeightChange = useCallback(() => {
    if (!pinnedToBottomRef.current && !preserveBottomOnNextPaneResizeRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!pinnedToBottomRef.current && !preserveBottomOnNextPaneResizeRef.current) {
        return;
      }
      requestPinnedBottomAlignment("auto", { preferExactRestore: true });
    });
  }, [requestPinnedBottomAlignment]);

  if (!api || !snapshot) {
    return (
      <div className="shell shell--loading">
        <main className="loading-card">
          <div className="loading-card__eyebrow">pi-gui</div>
          <h1>正在加载会话</h1>
          <p>桌面端正在从主进程恢复工作区和对话状态。</p>
        </main>
      </div>
    );
  }

  const showTerminalTakeover = isTerminalVisibleForSelectedThread && isTerminalTakeoverForSelectedThread && Boolean(selectedWorkspace);
  const mainClassName = [
    "main",
    showDiffPanel ? "main--with-diff" : "",
    isTerminalVisibleForSelectedThread ? "main--with-terminal" : "",
    showTerminalTakeover ? "main--terminal-takeover" : "",
  ].filter(Boolean).join(" ");
  const terminalPanel = isTerminalVisibleForSelectedThread && selectedWorkspace ? (
    <TerminalPanel
      workspace={selectedWorkspace}
      sessionId={selectedSession?.id ?? ""}
      height={terminalHeight}
      isTakeover={isTerminalTakeoverForSelectedThread}
      onHeightChange={(nextHeight) => {
        setTerminalHeight(nextHeight);
        setTakeoverTerminalSessionKey((current) => (current === selectedSessionKey ? "" : current));
      }}
      onToggleTakeover={() => {
        setTakeoverTerminalSessionKey((current) => (current === selectedSessionKey ? "" : selectedSessionKey));
      }}
      onHide={() => {
        setOpenTerminalSessionKey((current) => (current === selectedSessionKey ? "" : current));
        setTakeoverTerminalSessionKey((current) => (current === selectedSessionKey ? "" : current));
        focusComposer();
      }}
    />
  ) : null;

  const centerDiffPreview = showDiffPanel && centerDiffFile ? (
    <section className="center-diff-preview" aria-label={`文件 diff：${centerDiffFile}`}>
      <div className="center-diff-preview__header">
        <span className="center-diff-preview__eyebrow">Diff 预览</span>
        <strong className="center-diff-preview__path">{centerDiffFile}</strong>
      </div>
      <div className="center-diff-preview__body">
        {centerDiffLoading ? (
          <div className="center-diff-preview__empty">正在加载 diff…</div>
        ) : centerDiffText ? (
          <InlineDiff diff={centerDiffText} language={extensionToLanguage(centerDiffFile)} />
        ) : (
          <div className="center-diff-preview__empty">这个文件没有可显示的 diff。</div>
        )}
      </div>
    </section>
  ) : null;

  const setActiveView = (view: AppView) => {
    void updateSnapshot(api, setSnapshot, () => api.setActiveView(view));
  };

  const openSkills = (workspaceId?: string) => {
    const nextWorkspaceId =
      workspaceId && rootWorkspaceOptions.some((workspace) => workspace.id === workspaceId)
        ? workspaceId
        : skillsWorkspace?.id || rootWorkspaceOptions[0]?.id || "";
    if (nextWorkspaceId) {
      setSkillsWorkspaceId(nextWorkspaceId);
    }
    setActiveView("skills");
  };

  const openExtensions = (workspaceId?: string) => {
    const nextWorkspaceId =
      workspaceId && rootWorkspaceOptions.some((workspace) => workspace.id === workspaceId)
        ? workspaceId
        : extensionsWorkspace?.id || rootWorkspaceOptions[0]?.id || "";
    if (nextWorkspaceId) {
      setExtensionsWorkspaceId(nextWorkspaceId);
    }
    setActiveView("extensions");
  };

  const openNewThreadSurface = (workspaceId?: string) => {
    setPendingNewThreadWorkspaceId("");
    resetNewThreadSurface(workspaceId);
    setActiveView("new-thread");
  };

  const handleSelectNewThreadWorkspace = (workspaceId: string) => {
    setPendingNewThreadWorkspaceId("");
    setNewThreadRootWorkspaceId(workspaceId);
    setNewThreadAttachments([]);
    setNewThreadProvider(undefined);
    setNewThreadModelId(undefined);
    setNewThreadThinkingLevel(undefined);
    setNewThreadComposerError(undefined);
  };

  const submitComposerDraft = (options: { readonly deliverAs?: "steer" | "followUp" } = {}) => {
    if (!selectedSession) {
      return;
    }

    const hasComposerInput = composerDraft.trim().length > 0 || composerAttachments.length > 0;
    if (selectedSession.status === "running" && !hasComposerInput) {
      void updateSnapshot(api, setSnapshot, () => api.cancelCurrentRun());
      return;
    }

    if (!hasComposerInput) {
      return;
    }
    if (selectedSessionModelOnboarding.requiresModelSelection) {
      return;
    }

    const treeCommand = parseTreeComposerCommand(composerDraft);
    if (treeCommand?.type === "error") {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              lastError: treeCommand.message,
            }
          : current,
      );
      return;
    }
    if (treeCommand?.type === "tree") {
      openTreeModal();
      return;
    }

    const previousDraft = composerDraft;
    const submittingSessionKey = selectedSessionKey;
    setComposerDraft("");
    setAttachmentsClearedSessionKey(submittingSessionKey);
    void (async () => {
      const nextState = await updateSnapshot(api, setSnapshot, () =>
        api.submitComposer(previousDraft, selectedSession.status === "running" ? { deliverAs: options.deliverAs ?? "followUp" } : undefined),
      );
      setComposerDraft(nextState.composerDraft);
      setAttachmentsClearedSessionKey((prev) => (prev === submittingSessionKey ? null : prev));
    })().catch(() => {
      setComposerDraft(previousDraft);
      setAttachmentsClearedSessionKey((prev) => (prev === submittingSessionKey ? null : prev));
    });
  };

  const handleRunDevelopmentOrchestration = () => {
    if (!api) return;
    void updateSnapshot(api, setSnapshot, () => api.runDevelopmentOrchestration());
  };

  const handlePickAttachments = () => {
    void updateSnapshot(api, setSnapshot, () => api.pickComposerAttachments());
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    void updateSnapshot(api, setSnapshot, () => api.removeComposerAttachment(attachmentId));
  };

  const handleEditQueuedMessage = (messageId: string) => {
    void updateSnapshot(api, setSnapshot, () => api.editQueuedComposerMessage(messageId, composerDraft)).then(() => {
      composerRef.current?.focus();
    });
  };

  const handleCancelQueuedEdit = () => {
    void updateSnapshot(api, setSnapshot, () => api.cancelQueuedComposerEdit()).then(() => {
      composerRef.current?.focus();
    });
  };

  const handleRemoveQueuedMessage = (messageId: string) => {
    void updateSnapshot(api, setSnapshot, () => api.removeQueuedComposerMessage(messageId));
  };

  const handleSteerQueuedMessage = (messageId: string) => {
    void updateSnapshot(api, setSnapshot, () => api.steerQueuedComposerMessage(messageId));
  };

  const handleNewThreadAddAttachments = (files: File[]) => {
    const pathFiles: string[] = [];
    const fallbackFiles: File[] = [];
    for (const file of files) {
      const fsPath = resolveComposerFilePath(file);
      if (fsPath) {
        pathFiles.push(fsPath);
      } else {
        fallbackFiles.push(file);
      }
    }

    if (api && pathFiles.length > 0) {
      void api.readNewThreadAttachmentPathReferences(pathFiles).then((attachments) => {
        if (attachments.length > 0) {
          setNewThreadAttachments((current) => [...current, ...attachments]);
        }
      });
    }
    if (fallbackFiles.length === 0) {
      return;
    }
    void readComposerAttachmentsFromFiles(fallbackFiles).then((attachments) => {
      if (attachments.length === 0) {
        return;
      }
      setNewThreadAttachments((current) => [...current, ...attachments]);
    });
  };

  const handleNewThreadRemoveAttachment = (attachmentId: string) => {
    setNewThreadAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleImagePaste = (event: ClipboardEvent<HTMLDivElement>, onFiles: (files: File[]) => void) => {
    const files = extractImageFilesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    onFiles(files);
  };

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>, onFiles: (files: File[]) => void) => {
    event.preventDefault();
    const files = extractFilesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) {
      return;
    }
    onFiles(files);
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = extractImageFilesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    if (!api) {
      return;
    }
    event.preventDefault();

    const previousIds = new Set(snapshot?.composerAttachments?.map((a) => a.id) ?? []);
    void updateSnapshot(api, setSnapshot, () => api.pasteClipboardImageToComposer()).then((state) => {
      const currentIds = state.composerAttachments?.map((a) => a.id) ?? [];
      const hasNewId = currentIds.some((id) => !previousIds.has(id));
      if (!hasNewId) {
        void addAttachmentsToSessionComposer(files);
      }
    }).catch(() => {
      void addAttachmentsToSessionComposer(files);
    });
  };

  const handleNewThreadComposerPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = extractImageFilesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    if (!api) {
      return;
    }
    event.preventDefault();
    void api.readClipboardImageReference().then((clipboardImage) => {
      if (clipboardImage) {
        setNewThreadAttachments((current) => [...current, clipboardImage]);
      } else {
        handleNewThreadAddAttachments(files);
      }
    }).catch(() => {
      handleNewThreadAddAttachments(files);
    });
  };

  const handleComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    handleAttachmentDrop(event, (files) => {
      void addAttachmentsToSessionComposer(files);
    });
  };

  const handleNewThreadComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    handleAttachmentDrop(event, handleNewThreadAddAttachments);
  };

  async function addAttachmentsToSessionComposer(files: File[]) {
    if (!api) {
      return;
    }
    const pathFiles: string[] = [];
    const fallbackFiles: File[] = [];
    for (const file of files) {
      const fsPath = resolveComposerFilePath(file);
      if (fsPath) {
        pathFiles.push(fsPath);
      } else {
        fallbackFiles.push(file);
      }
    }

    if (pathFiles.length > 0) {
      void updateSnapshot(api, setSnapshot, () => api.addComposerAttachmentPaths(pathFiles));
    }
    if (fallbackFiles.length === 0) {
      return;
    }

    const valid = await readComposerAttachmentsFromFiles(fallbackFiles);
    if (valid.length === 0) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.addComposerAttachments(valid));
  }

  const handleClipboardImageShortcut = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    onImage: (attachment: ComposerImageAttachment) => void,
  ): boolean => {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "v") {
      return false;
    }

    if (!api) {
      return false;
    }

    event.preventDefault();
    void api.readClipboardImageReference().then((clipboardImage) => {
      if (clipboardImage) {
        onImage(clipboardImage);
      }
    });
    return true;
  };

  const handleSetSessionModel = (provider: string, modelId: string) => {
    if (!selectedWorkspace || !selectedSession) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () =>
      api.setSessionModel(selectedWorkspace.id, selectedSession.id, provider, modelId),
    );
  };

  const handleSetSessionThinking = (level: string) => {
    if (!selectedWorkspace || !selectedSession) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () =>
      api.setSessionThinkingLevel(
        selectedWorkspace.id,
        selectedSession.id,
        level as NonNullable<RuntimeSnapshot["settings"]["defaultThinkingLevel"]>,
      ),
    );
  };

  const handleSetDefaultModel = (provider: string, modelId: string) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setDefaultModel(settingsWorkspace.id, provider, modelId));
  };

  const handleSetThinkingLevel = (thinkingLevel: RuntimeSnapshot["settings"]["defaultThinkingLevel"]) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setDefaultThinkingLevel(settingsWorkspace.id, thinkingLevel));
  };

  const handleToggleSkillCommands = (enabled: boolean) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setEnableSkillCommands(settingsWorkspace.id, enabled));
  };

  const handleSetScopedModelPatterns = (patterns: readonly string[]) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setScopedModelPatterns(settingsWorkspace.id, patterns));
  };

  const handleSetModelSettingsScopeMode = (mode: "app-global" | "per-repo") => {
    if (!api) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setModelSettingsScopeMode(mode));
  };

  const handleLoginProvider = (providerId: string) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.loginProvider(settingsWorkspace.id, providerId));
  };

  const handleLogoutProvider = (providerId: string) => {
    if (!settingsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.logoutProvider(settingsWorkspace.id, providerId));
  };

  const handleSetProviderApiKey = async (providerId: string, apiKey: string): Promise<string | undefined> => {
    if (!api || !settingsWorkspace) {
      return "请先选择一个工作区。";
    }
    const state = await updateSnapshot(api, setSnapshot, () =>
      api.setProviderApiKey(settingsWorkspace.id, providerId, apiKey),
    );
    return state.lastError;
  };

  const handleRemoveProviderApiKey = async (providerId: string): Promise<string | undefined> => {
    if (!api || !settingsWorkspace) {
      return "请先选择一个工作区。";
    }
    const state = await updateSnapshot(api, setSnapshot, () =>
      api.logoutProvider(settingsWorkspace.id, providerId),
    );
    return state.lastError;
  };

  const handleDiscoverThirdPartyModels = (input: ThirdPartyModelDiscoveryInput) => {
    return api.discoverThirdPartyModels(input);
  };

  const handleSaveThirdPartyModelProvider = async (
    input: ThirdPartyModelProviderInput,
  ): Promise<string | undefined> => {
    if (!api || !settingsWorkspace) {
      return "请先选择一个工作区。";
    }
    const state = await updateSnapshot(api, setSnapshot, () =>
      api.saveThirdPartyModelProvider(settingsWorkspace.id, input),
    );
    return state.lastError;
  };

  const handleToggleSkill = (filePath: string, enabled: boolean) => {
    if (!skillsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setSkillEnabled(skillsWorkspace.id, filePath, enabled));
  };

  const handleOpenSkillFolder = (filePath: string) => {
    if (!skillsWorkspace) {
      return;
    }
    void api.openSkillInFinder(skillsWorkspace.id, filePath);
  };

  const handleToggleExtension = (filePath: string, enabled: boolean) => {
    if (!extensionsWorkspace) {
      return;
    }
    void updateSnapshot(api, setSnapshot, () => api.setExtensionEnabled(extensionsWorkspace.id, filePath, enabled));
  };

  const handleOpenExtensionFolder = (filePath: string) => {
    if (!extensionsWorkspace) {
      return;
    }
    void api.openExtensionInFinder(extensionsWorkspace.id, filePath);
  };

  const handleTrySkill = (command: string) => {
    void updateSnapshot(api, setSnapshot, () => api.setActiveView("threads"));
    slashMenu.fillComposerFromSlash(command);
  };

  const handleSetThemeMode = (mode: "system" | "light" | "dark") => {
    if (!api) return;
    setThemeMode(mode);
    void api.setThemeMode(mode);
  };

  const handleSetAppearanceTheme = (theme: AppearanceThemeId) => {
    void updateSnapshot(api, setSnapshot, () => api.setAppearanceTheme(theme));
  };

  const handleSetBackgroundGradientIntensity = (value: number) => {
    void updateSnapshot(api, setSnapshot, () => api.setBackgroundGradientIntensity(value));
  };

  const handleSetComponentDock = (componentDock: DesktopAppState["componentDock"]) => {
    void updateSnapshot(api, setSnapshot, () => api.setComponentDock(componentDock));
  };

  const handleSaveDockComponentDefinition = (
    definition: DesktopAppState["componentDock"]["componentDefinitions"][number],
    pinned: boolean,
  ) => {
    void updateSnapshot(api, setSnapshot, () => api.saveDockComponentDefinition(definition, pinned));
  };

  const handleGenerateDockComponentDefinition: PiDesktopApi["generateDockComponentDefinition"] = (input) =>
    api.generateDockComponentDefinition(input);

  const handleOpenDockComponentConfig = (componentId: string) => {
    const component = snapshot.componentDock.componentDefinitions.find((entry) => entry.id === componentId);
    const extensionSelection = component?.kind === "development-mode" ? "__development_mode__" : "__components__";
    setSelectedDockComponentId(componentId);
    setSelectedExtensionPath(extensionSelection);
    openExtensions(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id ?? extensionsWorkspace?.id);
  };

  const handleSetNotificationPreferences = (preferences: Partial<DesktopAppState["notificationPreferences"]>) => {
    void updateSnapshot(api, setSnapshot, () => api.setNotificationPreferences(preferences));
  };

  const handleSetMobileSyncSettings = (settings: DesktopAppState["mobileSync"]) => {
    void updateSnapshot(api, setSnapshot, () => api.setMobileSyncSettings(settings));
  };

  const handleSetDifyConfig = (config: import("./desktop-state").DifyConfig) => {
    void updateSnapshot(api, setSnapshot, () => api.setDifyConfig(config));
  };
  const handleSetCliTools = (tools: readonly import("./desktop-state").CliToolConfig[]) => {
    void updateSnapshot(api, setSnapshot, () => api.setCliTools(tools));
  };

  const handleGenerateMobileSyncPairQrCode = (relayUrl: string) => {
    return (window as any).piApp?.generateMobileSyncPairQrCode(relayUrl) as Promise<{ pairToken: string; qrImage: string; qrData: string }>;
  };

  const handleSetIntegratedTerminalShell = (shellPath: string) => {
    void updateSnapshot(api, setSnapshot, () => api.setIntegratedTerminalShell(shellPath));
  };

  const handleRequestNotificationPermission = () => {
    if (!api?.requestNotificationPermission) {
      return;
    }
    setNotificationPermissionPending(true);
    void api
      .requestNotificationPermission()
      .then((status) => {
        setNotificationPermissionStatus(status);
      })
      .finally(() => {
        setNotificationPermissionPending(false);
      });
  };

  const handleOpenSystemNotificationSettings = () => {
    if (!api?.openSystemNotificationSettings) {
      return;
    }
    setNotificationPermissionPending(true);
    void api
      .openSystemNotificationSettings()
      .finally(() => {
        setNotificationPermissionPending(false);
      });
  };

  const handleOpenComputerUsePrivacySettings = (pane: DesktopComputerUsePrivacyPane) => {
    if (!api?.openComputerUsePrivacySettings) {
      return;
    }
    void api.openComputerUsePrivacySettings(pane);
  };

  const handleSetLockedComputerUseEnabled = (enabled: boolean) => {
    if (!api?.setLockedComputerUseEnabled) {
      return;
    }
    setComputerUseStatusPending(true);
    void api
      .setLockedComputerUseEnabled(enabled)
      .then((status) => {
        setComputerUseStatus(status);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setComputerUseStatus((current) => ({
          helperAvailable: current?.helperAvailable ?? false,
          helperPath: current?.helperPath,
          desktop: current?.desktop ?? "unknown",
          frontmostApp: current?.frontmostApp,
          cursor: current?.cursor ?? "unknown",
          cursorActive: current?.cursorActive,
          cursorDurationMs: current?.cursorDurationMs,
          cursorGlideMs: current?.cursorGlideMs,
          accessibility: current?.accessibility ?? "unknown",
          screenRecording: current?.screenRecording ?? "unknown",
          lockedUse: current?.lockedUse ?? "unknown",
          lockedUseInstaller: current?.lockedUseInstaller,
          lockedUseInstallerPath: current?.lockedUseInstallerPath,
          message,
        }));
      })
      .finally(() => {
        setComputerUseStatusPending(false);
      });
  };

  const handleArchiveSession = (target: { workspaceId: string; sessionId: string }) => {
    void updateSnapshot(api, setSnapshot, () => api.archiveSession(target));
  };

  const handleRenameSession = (target: { workspaceId: string; sessionId: string }, title: string) => {
    void updateSnapshot(api, setSnapshot, () => api.renameSession(target, title));
  };

  const handleSelectSession = (target: { workspaceId: string; sessionId: string }) => {
    setOpenTerminalSessionKey("");
    setTakeoverTerminalSessionKey("");
    void updateSnapshot(api, setSnapshot, () => api.selectSession(target)).then(() => {
      focusComposer();
    });
  };

  const handleRespondToExtensionDialog = (
    response:
      | { readonly requestId: string; readonly value: string }
      | { readonly requestId: string; readonly confirmed: boolean }
      | { readonly requestId: string; readonly cancelled: true },
  ) => {
    if (!selectedWorkspace || !selectedSession) {
      return;
    }

    void updateSnapshot(api, setSnapshot, () =>
      api.respondToHostUiRequest(selectedWorkspace.id, selectedSession.id, response),
    ).then(() => {
      focusComposer();
    });
  };

  const handleToggleExtensionDock = () => {
    if (!selectedExtensionDock) {
      return;
    }

    setDockExpandedBySession((current) => ({
      ...current,
      [selectedSessionKey]: !(current[selectedSessionKey] ?? false),
    }));
  };

  const handleUnarchiveSession = (target: { workspaceId: string; sessionId: string }) => {
    void updateSnapshot(api, setSnapshot, () => api.unarchiveSession(target));
  };

  const handleStartThread = () => {
    if (!newThreadRootWorkspaceId || (!newThreadPrompt.trim() && newThreadAttachments.length === 0)) {
      return;
    }
    if (newThreadModelOnboarding.requiresModelSelection) {
      return;
    }
    const treeCommand = parseTreeComposerCommand(newThreadPrompt);
    if (treeCommand?.type === "error") {
      setNewThreadComposerError(treeCommand.message);
      return;
    }
    if (treeCommand?.type === "tree") {
      setNewThreadComposerError("/tree 只能在已有会话中使用。");
      return;
    }
    const modelConfig = {
      prompt: newThreadPrompt,
      attachments: newThreadAttachments,
      provider: resolvedNewThreadProvider,
      modelId: resolvedNewThreadModelId,
      thinkingLevel: resolvedNewThreadThinkingLevel,
    };
    const input: StartThreadInput = {
      rootWorkspaceId: newThreadRootWorkspaceId,
      environment: newThreadEnvironment,
      ...modelConfig,
    };
    wsMenu.expandWorkspace(newThreadRootWorkspaceId);
    void updateSnapshot(api, setSnapshot, () =>
      api.startThread(input),
    ).then(() => {
      setNewThreadPrompt("");
      setNewThreadAttachments([]);
      setNewThreadProvider(undefined);
      setNewThreadModelId(undefined);
      setNewThreadThinkingLevel(undefined);
      setNewThreadEnvironment("local");
    });
  };

  const handleTimelineUserScrollIntent = () => {
    pinnedToBottomRef.current = false;
    preserveBottomOnNextPaneResizeRef.current = false;
    resetExactBottomRestoreState();
    setDisableTimelineVirtualization(false);
    lastTimelinePinnedBySessionRef.current.set(selectedSessionKey, false);
  };

  const handleTimelineScroll = () => {
    const pane = timelinePaneRef.current;
    if (!pane) {
      return;
    }

    const pinned = isNearBottom(pane);
    if (preserveBottomOnNextPaneResizeRef.current && !pinned) {
      return;
    }

    pinnedToBottomRef.current = pinned;
    lastTimelineScrollTopBySessionRef.current.set(selectedSessionKey, pane.scrollTop);
    lastTimelinePinnedBySessionRef.current.set(selectedSessionKey, pinned);
    if (pinned) {
      setShowJumpToLatest(false);
    }
  };

  const jumpToLatest = () => {
    requestPinnedBottomAlignment("smooth", { preferExactRestore: true });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu.handleMentionKeyDown(event)) {
      return;
    }

    if (slashMenu.handleSlashKeyDown(event)) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && selectedSession?.status === "running") {
      event.preventDefault();
      submitComposerDraft({ deliverAs: (event.metaKey || event.ctrlKey) ? "steer" : "followUp" });
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!composerDraft.trim() && composerAttachments.length === 0) {
      return;
    }
    if (selectedSessionModelOnboarding.requiresModelSelection) {
      return;
    }

    submitComposerDraft();
  };

  const handleNewThreadComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleClipboardImageShortcut(event, (clipboardImage) => {
      setNewThreadAttachments((current) => [...current, clipboardImage]);
    })) {
      return;
    }

    if (newThreadMentionMenu.handleMentionKeyDown(event)) {
      return;
    }

    if (newThreadSlashMenu.handleSlashKeyDown(event)) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!newThreadPrompt.trim() && newThreadAttachments.length === 0) {
      return;
    }
    if (newThreadModelOnboarding.requiresModelSelection) {
      return;
    }

    handleStartThread();
  };

  const settingsNav = navigationItems;

  const shellClassName = `shell${snapshot.sidebarCollapsed ? " shell--sidebar-collapsed" : ""}`;

  return (
    <div className={shellClassName}>
      {primarySidebarToggleVisible ? (
        <SidebarToggleButton
          collapsed={snapshot.sidebarCollapsed}
          shortcutLabel={sidebarToggleShortcutLabel}
          onToggle={handleTogglePrimarySidebar}
        />
      ) : null}
      {!snapshot.sidebarCollapsed ? (
        <Sidebar
          activeView={snapshot.activeView}
          sidebarTab={snapshot.sidebarTab}
          selectedWorkspace={selectedWorkspace}
          selectedSession={selectedSession}
          visibleWorkspaces={visibleWorkspaces}
          threadGroups={threadGroups}
          recentConversations={recentConversations}
          conversationGroups={snapshot.conversationGroups}
          linkedWorktreeByWorkspaceId={linkedWorktreeByWorkspaceId}
          sessionCategoriesByWorkspace={snapshot.sessionCategoriesByWorkspace}
          wsMenu={wsMenu}
          api={api}
          setSnapshot={setSnapshot}
          updateSnapshot={updateSnapshot}
          onNewThread={() => openNewThreadSurface(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id)}
          onSetActiveView={setActiveView}
          onSetSidebarTab={(tab) => void updateSnapshot(api, setSnapshot, () => api.setSidebarTab(tab))}
          onCreateConversationGroup={(name) => void updateSnapshot(api, setSnapshot, () => api.createConversationGroup(name))}
          onRenameConversationGroup={(groupId, name) => void updateSnapshot(api, setSnapshot, () => api.renameConversationGroup(groupId, name))}
          onDeleteConversationGroup={(groupId) => void updateSnapshot(api, setSnapshot, () => api.deleteConversationGroup(groupId))}
          onAssignConversationToGroup={(target, groupId) => void updateSnapshot(api, setSnapshot, () => api.assignConversationToGroup(target, groupId))}
          onOpenSkills={openSkills}
          onOpenExtensions={openExtensions}
          onOpenSettings={openSettings}
          rootWorkspaceOptions={rootWorkspaceOptions}
          settingsSection={settingsSection}
          settingsWorkspace={settingsWorkspace}
          skillsWorkspace={skillsWorkspace}
          extensionsWorkspace={extensionsWorkspace}
          settingsNav={settingsNav}
          skillsRuntime={skillsRuntime}
          extensionsRuntime={extensionsRuntime}
          selectedSkillPath={selectedSkillPath}
          selectedExtensionPath={selectedExtensionPath}
          onSelectSettingsSection={(section) => {
            setSettingsSection(section);
            openSettings(settingsWorkspace?.id ?? selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id, section);
          }}
          onSelectSettingsWorkspace={setSettingsWorkspaceId}
          onSelectSkillsWorkspace={setSkillsWorkspaceId}
          onSelectExtensionsWorkspace={setExtensionsWorkspaceId}
          onSelectSkillPath={setSelectedSkillPath}
          onSelectExtensionPath={setSelectedExtensionPath}
          onArchiveSession={handleArchiveSession}
          onRenameSession={handleRenameSession}
          onSelectSession={handleSelectSession}
          onUnarchiveSession={handleUnarchiveSession}
        />
      ) : null}

      <main className={mainClassName}>
        <Topbar
          activeView={snapshot.activeView}
          rootWorkspace={rootWorkspace}
          selectedWorkspace={selectedWorkspace}
          selectedSession={selectedSession}
          selectedSessionTitle={displayedSessionTitle || selectedSession?.title}
          selectedWorktree={selectedWorktree}
          activeWorktrees={activeWorktrees}
          workspaces={snapshot.workspaces}
          wsMenu={wsMenu}
          api={api}
          setSnapshot={setSnapshot}
          updateSnapshot={updateSnapshot}
          terminalAvailable={Boolean(selectedSessionKey)}
          terminalVisible={isTerminalVisibleForSelectedThread}
          onToggleTerminal={toggleTerminal}
          showDiffPanel={showDiffPanel}
          onToggleDiffPanel={toggleDiffPanel}
          onRefreshConversation={() => void updateSnapshot(api, setSnapshot, () => api.syncCurrentWorkspace())}
          onRenameSession={handleRenameSession}
        />
        <ComponentDock
          state={snapshot.componentDock}
          onChange={handleSetComponentDock}
          onOpenConfig={handleOpenDockComponentConfig}
        />

        {showTerminalTakeover ? (
          terminalPanel
        ) : (
          <>
        {snapshot.activeView === "settings" ? (
          <>
            {settingsSection === "providers" || (settingsSection === "models" && snapshot.modelSettingsScopeMode === "per-repo") ? (
              <div className="surface-toolbar surface-toolbar--inline">
                <label className="surface-toolbar__field">
                  <span>工作区</span>
                  <select
                    value={settingsWorkspace?.id ?? ""}
                    onChange={(event) => setSettingsWorkspaceId(event.target.value)}
                  >
                    {rootWorkspaceOptions.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <SettingsView
              workspace={settingsWorkspace}
              runtime={settingsSection === "models" ? settingsModelRuntime : settingsRuntime}
              section={settingsSection}
              notificationPreferences={snapshot.notificationPreferences}
              mobileSync={snapshot.mobileSync}
              difyConfig={difyConfig}
              notificationPermissionStatus={notificationPermissionStatus}
              notificationPermissionPending={notificationPermissionPending}
              computerUseStatus={computerUseStatus}
              computerUseStatusPending={computerUseStatusPending}
              modelSettingsScopeMode={snapshot.modelSettingsScopeMode}
              integratedTerminalShell={snapshot.integratedTerminalShell}
              appearanceTheme={appearanceTheme}
              appearanceThemes={appearanceThemes}
              themeMode={themeMode}
              enableTransparency={snapshot.enableTransparency}
              onLoginProvider={handleLoginProvider}
              onLogoutProvider={handleLogoutProvider}
              onSetProviderApiKey={handleSetProviderApiKey}
              onRemoveProviderApiKey={handleRemoveProviderApiKey}
              onDiscoverThirdPartyModels={handleDiscoverThirdPartyModels}
              onSaveThirdPartyModelProvider={handleSaveThirdPartyModelProvider}
              onSetModelSettingsScopeMode={handleSetModelSettingsScopeMode}
              onSetDefaultModel={handleSetDefaultModel}
              onSetNotificationPreferences={handleSetNotificationPreferences}
              onSetMobileSyncSettings={handleSetMobileSyncSettings}
              onSaveDifyConfig={handleSetDifyConfig}
              onGenerateMobileSyncPairQrCode={handleGenerateMobileSyncPairQrCode}
              onSetIntegratedTerminalShell={handleSetIntegratedTerminalShell}
              onRequestNotificationPermission={handleRequestNotificationPermission}
              onOpenSystemNotificationSettings={handleOpenSystemNotificationSettings}
              onRefreshComputerUseStatus={refreshComputerUseStatus}
              onSetLockedComputerUseEnabled={handleSetLockedComputerUseEnabled}
              onOpenComputerUsePrivacySettings={handleOpenComputerUsePrivacySettings}
              onSetScopedModelPatterns={handleSetScopedModelPatterns}
              onSetAppearanceTheme={handleSetAppearanceTheme}
              onSetThemeMode={handleSetThemeMode}
              onSetThinkingLevel={handleSetThinkingLevel}
              onToggleSkillCommands={handleToggleSkillCommands}
              onSetEnableTransparency={(enabled) => {
                void updateSnapshot(api, setSnapshot, () => api.setEnableTransparency(enabled));
              }}
              appMode={snapshot.appMode}
              developmentModePresets={snapshot.developmentModePresets}
              activeDevelopmentModePresetId={snapshot.activeDevelopmentModePresetId}
              onSetDevelopmentModePresets={(presets) => {
                void updateSnapshot(api, setSnapshot, () => api.setDevelopmentModePresets(presets));
              }}
              onSetActiveDevelopmentModePresetId={(id) => {
                void updateSnapshot(api, setSnapshot, () => api.setActiveDevelopmentModePresetId(id));
              }}
              onSetAppMode={(mode) => {
                void updateSnapshot(api, setSnapshot, () => api.setAppMode(mode));
              }}
            />
          </>
        ) : snapshot.activeView === "skills" ? (
          <SkillsView
            workspace={skillsWorkspace}
            runtime={skillsRuntime}
            selectedSkillPath={selectedSkillPath}
            onSelectSkill={setSelectedSkillPath}
            onOpenSkillFolder={handleOpenSkillFolder}
            onRefresh={() => {
              if (!skillsWorkspace) {
                return;
              }
              void updateSnapshot(api, setSnapshot, () => api.refreshRuntime(skillsWorkspace.id));
            }}
            onToggleSkill={handleToggleSkill}
            onTrySkill={(skill) =>
              handleTrySkill(
                skill.filePath
                  ? `${skill.slashCommand} `
                  : "为当前工作区创建一个新技能，并说明将添加哪些文件。",
              )
            }
          />
        ) : snapshot.activeView === "extensions" ? (
          <ExtensionsView
            workspace={extensionsWorkspace}
            runtime={extensionsRuntime}
            commandCompatibility={extensionsCommandCompatibility}
            selectedExtensionPath={selectedExtensionPath}
            onSelectExtension={setSelectedExtensionPath}
            selectedDockComponentId={selectedDockComponentId}
            backgroundGradientIntensity={snapshot.backgroundGradientIntensity}
            componentDock={snapshot.componentDock}
            onSetBackgroundGradientIntensity={handleSetBackgroundGradientIntensity}
            onSetComponentDock={handleSetComponentDock}
            onSaveDockComponentDefinition={handleSaveDockComponentDefinition}
            onGenerateDockComponentDefinition={handleGenerateDockComponentDefinition}
            onOpenExtensionFolder={handleOpenExtensionFolder}
            onOpenComputerUseSettings={() => openSettings(extensionsWorkspace?.id, "computer-use")}
            onRefresh={() => {
              if (!extensionsWorkspace) {
                return;
              }
              void updateSnapshot(api, setSnapshot, () => api.refreshRuntime(extensionsWorkspace.id));
            }}
            onToggleExtension={handleToggleExtension}
            difyConfig={difyConfig}
            onSaveDifyConfig={handleSetDifyConfig}
            cliTools={cliTools}
            onSaveCliTools={handleSetCliTools}
          />
        ) : snapshot.activeView === "new-thread" ? (
          rootWorkspaceOptions.length > 0 ? (
            <NewThreadView
              workspaces={rootWorkspaceOptions}
              selectedWorkspaceId={newThreadRootWorkspaceId || rootWorkspaceOptions[0]?.id || ""}
              runtime={newThreadRuntime}
              environment={newThreadEnvironment}
              prompt={newThreadPrompt}
              attachments={newThreadAttachments}
              lastError={newThreadComposerError}
              provider={resolvedNewThreadProvider}
              modelId={resolvedNewThreadModelId}
              thinkingLevel={resolvedNewThreadThinkingLevel}
              modelOnboarding={newThreadModelOnboarding}
              composerRef={newThreadComposerRef}
              activeSlashCommand={newThreadSlashMenu.activeSlashFlow?.command}
              activeSlashCommandMeta={newThreadSlashMenu.activeSlashFlow?.command?.description}
              slashSections={newThreadSlashMenu.slashSections}
              slashOptions={newThreadSlashMenu.slashOptions}
              selectedSlashCommand={newThreadSlashMenu.activeSlashOptionCommand ?? newThreadSlashMenu.selectedSlashCommand}
              selectedSlashOption={newThreadSlashMenu.selectedSlashOption}
              showSlashMenu={newThreadSlashMenu.showSlashMenu}
              showSlashOptionMenu={newThreadSlashMenu.showSlashOptionMenu}
              slashOptionEmptyState={newThreadSlashMenu.slashOptionEmptyState}
              showMentionMenu={newThreadMentionMenu.showMentionMenu}
              mentionOptions={newThreadMentionMenu.mentionOptions}
              selectedMentionIndex={newThreadMentionMenu.selectedIndex}
              onChangePrompt={setNewThreadPrompt}
              onSelectEnvironment={setNewThreadEnvironment}
              onSelectWorkspace={handleSelectNewThreadWorkspace}
              onSetModel={(provider, modelId) => { setNewThreadProvider(provider); setNewThreadModelId(modelId); }}
              onSetThinking={setNewThreadThinkingLevel}
              onOpenModelSettings={(section) => openSettings(newThreadWorkspace?.id, section)}
              onComposerKeyDown={handleNewThreadComposerKeyDown}
              onComposerPaste={handleNewThreadComposerPaste}
              onComposerDrop={handleNewThreadComposerDrop}
              onClearSlashCommand={newThreadSlashMenu.resetSlashUi}
              onSelectSlashCommand={(command) => {
                newThreadSlashMenu.applySlashCommandSelection(command, "click");
              }}
              onSelectSlashOption={(option) => {
                newThreadSlashMenu.applySlashOptionSelection(option);
              }}
              onSelectMention={newThreadMentionMenu.insertMention}
              onEnableMentionExtension={newThreadMentionMenu.enableMentionExtension}
              onAddAttachments={handleNewThreadAddAttachments}
              onRemoveAttachment={handleNewThreadRemoveAttachment}
              onSubmit={handleStartThread}
            />
          ) : (
            <section className="canvas canvas--empty">
              <div className="empty-panel">
                <div className="session-header__eyebrow">工作区</div>
                <h1>先打开一个文件夹开始</h1>
                <p>创建新对话前，先添加一个项目文件夹。</p>
              </div>
            </section>
          )
        ) : selectedWorkspace && selectedSession ? (
          <>
            <section className="canvas canvas--thread">
              <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div className="conversation conversation--thread">
                <div className="chat-header">
                  <div className="chat-header__eyebrow">
                    {selectedWorkspace.kind === "worktree"
                      ? `${rootWorkspace?.name ?? selectedWorkspace.name} · ${selectedWorktree?.name ?? selectedWorkspace.branchName ?? "工作树"}`
                      : `${selectedWorkspace.name} · 本地`}
                  </div>
                  <div className="chat-header__row">
                    <h1 className="chat-header__title">{displayedSessionTitle}</h1>
                    <div className={`chat-header__status${selectedSession.status === "running" ? " chat-header__status--running" : ""}`}>
                      {selectedSession.status === "running" && agentStatusLabel ? (
                        <>
                          <span className="chat-header__status-dot" />
                          <span>{agentStatusLabel}</span>
                        </>
                      ) : (
                        formatRelativeTime(selectedSession.updatedAt)
                      )}
                    </div>
                  </div>
                </div>

                <ConversationTimeline
                  transcript={displayedTranscript}
                  isTranscriptLoading={isTranscriptLoading}
                  timelinePaneRef={timelinePaneRef}
                  timelinePaneElementRef={setTimelinePaneElement}
                  disableVirtualization={disableTimelineVirtualization}
                  onDisableVirtualizationReady={finalizeTimelineVirtualizationDisable}
                  onTimelineScroll={handleTimelineScroll}
                  onTimelineUserScrollIntent={handleTimelineUserScrollIntent}
                  threadSearch={threadSearch}
                  showJumpToLatest={showJumpToLatest}
                  onJumpToLatest={jumpToLatest}
                  onContentHeightChange={handleTimelineContentHeightChange}
                  onViewFileInDiff={handleViewFileInDiff}
                  hasOlderMessages={hasOlderMessages}
                  onLoadOlderMessages={handleLoadOlderMessages}
                  isLoadingOlder={isLoadingOlderTranscript}
                  onExpandToolCall={handleExpandToolCall}
                  streaming={selectedSession?.status === "running"}
                />
                {centerDiffPreview}
              </div>
              {snapshot.appMode === "development" && snapshot.activeDevelopmentModePresetId ? (
                <DevelopmentWorkflowSteps snapshot={snapshot} selectedTranscript={selectedTranscript} />
              ) : null}
            </div>
            </section>
            {showWebPreview ? (
              <WebPreview onClose={() => setShowWebPreview(false)} />
            ) : null}
            <ComposerPanel
              key={selectedSessionKey}
              activeSlashCommand={slashMenu.activeSlashFlow?.command}
              activeSlashCommandMeta={slashMenu.activeSlashFlow?.command?.description}
              attachments={composerAttachments}
              queuedMessages={queuedComposerMessages}
              editingQueuedMessageId={editingQueuedMessageId}
              composerDraft={composerDraft}
              composerRef={composerRef}
              runtime={selectedModelRuntime}
              provider={resolvedSessionProvider}
              modelId={resolvedSessionModelId}
              thinkingLevel={resolvedSessionThinkingLevel}
              onClearSlashCommand={slashMenu.resetSlashUi}
              onComposerKeyDown={handleComposerKeyDown}
              onComposerPaste={handleComposerPaste}
              onComposerDrop={handleComposerDrop}
              onPickAttachments={handlePickAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              onEditQueuedMessage={handleEditQueuedMessage}
              onCancelQueuedEdit={handleCancelQueuedEdit}
              onRemoveQueuedMessage={handleRemoveQueuedMessage}
              onSteerQueuedMessage={handleSteerQueuedMessage}
              onSelectSlashCommand={(command) => {
                slashMenu.applySlashCommandSelection(command, "click");
              }}
              onSelectSlashOption={(option) => {
                slashMenu.applySlashOptionSelection(option);
              }}
              onSetModel={handleSetSessionModel}
              onSetThinking={handleSetSessionThinking}
              modelOnboarding={selectedSessionModelOnboarding}
              onOpenModelSettings={(section) =>
                openSettings(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id, section)
              }
              onSubmit={submitComposerDraft}
              onRunDevelopmentOrchestration={handleRunDevelopmentOrchestration}
              onToggleWebPreview={() => setShowWebPreview((prev) => !prev)}
              runningLabel={runningLabel}
              selectedSession={selectedSession}
              lastError={snapshot.lastError}
              selectedSlashCommand={slashMenu.activeSlashOptionCommand ?? slashMenu.selectedSlashCommand}
              selectedSlashOption={slashMenu.selectedSlashOption}
              slashOptionEmptyState={slashMenu.slashOptionEmptyState}
              setComposerDraft={setComposerDraft}
              showSlashOptionMenu={slashMenu.showSlashOptionMenu}
              showSlashMenu={slashMenu.showSlashMenu}
              slashOptions={slashMenu.slashOptions}
              slashSections={slashMenu.slashSections}
              showMentionMenu={mentionMenu.showMentionMenu}
              mentionOptions={mentionMenu.mentionOptions}
              selectedMentionIndex={mentionMenu.selectedIndex}
              onSelectMention={mentionMenu.insertMention}
              onEnableMentionExtension={mentionMenu.enableMentionExtension}
              extensionDock={selectedExtensionDock}
              extensionDockExpanded={isSelectedExtensionDockExpanded}
              onToggleExtensionDock={handleToggleExtensionDock}
              appMode={snapshot.appMode}
              developmentModePresets={snapshot.developmentModePresets}
              activeDevelopmentModePresetId={snapshot.activeDevelopmentModePresetId}
              onSetAppMode={(mode) => {
                void updateSnapshot(api, setSnapshot, () => api.setAppMode(mode));
              }}
              onSetActiveDevelopmentModePresetId={(id) => {
                void updateSnapshot(api, setSnapshot, () => api.setActiveDevelopmentModePresetId(id));
              }}
              onOpenDevelopmentSettings={() => {
                setSettingsSection("development");
                if (snapshot.activeView !== "settings") {
                  void updateSnapshot(api, setSnapshot, () => api.setActiveView("settings"));
                }
              }}
            />
            {activeExtensionDialog ? (
              <ExtensionDialog dialog={activeExtensionDialog} onRespond={handleRespondToExtensionDialog} />
            ) : null}
            {treeModalState.open ? (
              <TreeModal
                error={treeModalState.error}
                loading={treeModalState.loading}
                submitting={treeModalState.submitting}
                tree={treeModalState.tree}
                onClose={closeTreeModal}
                onNavigate={navigateTreeSelection}
              />
            ) : null}
          </>
        ) : selectedWorkspace ? (
          <section className="canvas canvas--empty">
            <div className="empty-panel">
              <div className="session-header__eyebrow">工作区</div>
              <h1>{selectedWorkspace.name}</h1>
              <p>先为这个文件夹创建一个对话，然后就可以在侧栏中切换历史会话。</p>
              <div className="empty-panel__actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => openNewThreadSurface(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id)}
                >
                  新对话
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="canvas canvas--empty">
            <div className="empty-panel">
              <div className="session-header__eyebrow">工作区</div>
              <h1>先打开一个文件夹开始</h1>
              <p>先添加项目文件夹，再按工作区分组浏览和切换历史对话。</p>
            </div>
          </section>
        )}

        {terminalPanel}
          </>
        )}
        {showDiffPanel && selectedWorkspace && selectedSession ? (
          <DiffPanel
            workspaceId={selectedWorkspace.id}
            sessionId={selectedSession.id}
            api={api}
            sessionStatus={selectedSession.status}
            fileRequest={diffFileRequest}
            onSelectChangedFile={handleSelectDiffFile}
          />
        ) : null}
      </main>
    </div>
  );
}

function buildTranscriptChangeMarker(sessionKey: string, transcript: readonly TranscriptMessage[]): string {
  const lastItem = transcript.at(-1);
  if (!lastItem) return `${sessionKey}:0`;
  if (lastItem.kind === "message") {
    return `${sessionKey}:${transcript.length}:message:${lastItem.id}:${lastItem.role}:${lastItem.text.length}`;
  }
  if (lastItem.kind === "tool") {
    const outputMarker = lastItem.outputOmitted
      ? `omitted:${lastItem.outputBytes ?? 0}`
      : typeof lastItem.output === "string"
        ? lastItem.output.length
        : lastItem.output === undefined
          ? 0
          : "object";
    return `${sessionKey}:${transcript.length}:tool:${lastItem.callId}:${lastItem.status}:${lastItem.detail?.length ?? 0}:${outputMarker}`;
  }
  return `${sessionKey}:${transcript.length}:${lastItem.kind}:${lastItem.id}`;
}

function isNearBottom(element: HTMLDivElement): boolean {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining < 32;
}
