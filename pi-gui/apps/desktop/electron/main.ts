import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
} from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DesktopAppStore, type DesktopAppViewState } from "./app-store";
import { configureComputerUseRuntime, runComputerUseLockedUseSelfTest } from "./computer-use-runtime";
import {
  getComputerUseStatus,
  openComputerUsePrivacySettings,
  setLockedComputerUseEnabled,
} from "./computer-use-status";
import { getChangedFiles, getFileDiff, stageFile } from "./app-store-diff";
import { listWorkspaceFiles } from "./app-store-files";
import { MAIN_DEV_RELOAD_MARKER } from "./dev-reload-main-probe";
import { NotificationManager } from "./notification-manager";
import { NotificationPermissionService } from "./notification-permission";
import { MobileSyncService } from "./mobile-sync-service";
import { checkForUpdate, initUpdateChecker } from "./update-checker";
import { ThemeManager } from "./theme-manager";
import { loadAppearanceThemes } from "./appearance-theme-loader";
import { TerminalService } from "./terminal-service";
import { assertComposerImageAttachmentSize } from "./composer-attachment-policy";
import { applyPreferredPiAgentDir } from "./agent-dir";
import { applyGuiNpmPath } from "./npm-env";
import { resolvePiGuiStoragePaths } from "./storage-paths";
import QRCode from "qrcode";
import type {
  AppearanceThemeId,
  AppView,
  ConversationSessionRef,
  DesktopAppState,
  SidebarTab,
  ThemeMode,
} from "../src/desktop-state";
import {
  desktopIpc,
  getDesktopCommandFromShortcut,
  type ThirdPartyModelDiscoveryInput,
  type ThirdPartyModelProviderInput,
} from "../src/ipc";
import { SUPPORTED_COMPOSER_IMAGE_TYPES } from "../src/composer-attachments";
import type {
  ComponentDockState,
  DockComponentDefinition,
  DockComponentGenerationInput,
  ComposerAttachment,
  ComposerFileAttachment,
  ComposerImageAttachment,
  CreateSessionInput,
  CreateWorktreeInput,
  MobileSyncSettings,
  RemoveWorktreeInput,
  SessionCategoryNode,
  StartThreadInput,
  WorkspaceSessionTarget,
} from "../src/desktop-state";
import type { SessionDriverEvent } from "@pi-gui/session-driver";
import type { GenerateThreadTitleOptions } from "@pi-gui/pi-sdk-driver";
import type { SessionRef, WorkspaceRef } from "@pi-gui/session-driver";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const windowTestMode = resolveWindowTestMode();
const devReloadMarkersEnabled = process.env.PI_APP_DEV_RELOAD_MARKERS === "1";
let store: DesktopAppStore;
const themeManager = new ThemeManager();
let mainWindow: BrowserWindow | null = null;
let notificationManager: NotificationManager | undefined;
let notificationPermissionService: NotificationPermissionService | undefined;
let terminalService: TerminalService | undefined;
let integratedTerminalShell = "";

function normalizeDesktopRelayUrl(input: string): string {
  let url = input.trim();
  if (!url) {
    return "ws://localhost:8787/ws/desktop";
  }
  if (!/^wss?:\/\//.test(url) && !/^https?:\/\//.test(url)) {
    url = `ws://${url}`;
  }
  if (url.startsWith("https://")) {
    url = `wss://${url.slice("https://".length)}`;
  } else if (url.startsWith("http://")) {
    url = `ws://${url.slice("http://".length)}`;
  }
  url = url.replace(/\/ws\/mobile$/, "/ws/desktop").replace(/\/+$/, "");
  if (!url.endsWith("/ws/desktop")) {
    url = `${url}/ws/desktop`;
  }
  return url;
}

interface WindowViewState {
  readonly selectedWorkspaceId: string;
  readonly selectedSessionId: string;
  readonly activeView: AppView;
  readonly sidebarCollapsed: boolean;
}

const appWindows = new Set<BrowserWindow>();
const windowViews = new Map<number, WindowViewState>();
const stopPublishingStateByWebContentsId = new Map<number, () => void>();
const stopPublishingSelectedTranscriptByWebContentsId = new Map<number, () => void>();
const stopTrackingWindowActivationByWebContentsId = new Map<number, () => void>();
let stopNotifications: (() => void) | undefined;
let stopMobileSync: (() => void) | undefined;
let stopUpdateChecker: (() => void) | undefined;
let stopPruningTerminals: (() => void) | undefined;
let retainedTerminalWorkspacePathSignature = "";
const terminalFocusedWebContentsIds = new Set<number>();
let quittingAfterStoreFlush = false;
let windowScopedActionQueue: Promise<void> = Promise.resolve();
let currentComposerDraftPersistOriginWebContentsId: number | undefined;
let currentWindowScopedWebContentsId: number | undefined;
let deferredActivationWebContentsId: number | undefined;

const SUPPORTED_IMAGE_TYPES = SUPPORTED_COMPOSER_IMAGE_TYPES;
const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(SUPPORTED_IMAGE_TYPES.map((type) => type.mimeType));
const NEW_WINDOW_MENU_ITEM_ID = "file.new-window";
const OPEN_FOLDER_MENU_ITEM_ID = "file.open-folder";
const CHECK_FOR_UPDATES_MENU_ITEM_ID = "app.check-for-updates";
const MAX_CLIPBOARD_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CLIPBOARD_IMAGE_DIMENSION = 8_192;
const MAX_NEW_THREAD_ATTACHMENT_REFERENCES = 100;

const newThreadAttachmentReferences = new Map<string, ComposerAttachment>();

function getTerminalService(): TerminalService {
  if (!terminalService) {
    terminalService = new TerminalService({
      getWorkspacePath: (workspaceId) => store.getWorkspacePath(workspaceId),
      getIntegratedTerminalShell: () => integratedTerminalShell,
      isPackaged: app.isPackaged,
    });
  }
  return terminalService;
}

// Resolve the bundled application icon. In dev the repo's `resources/icon.png`
// sits two levels up from the compiled `out/main/main.js`; in a packaged build
// it is copied to `process.resourcesPath` via `extraResources` in
// electron-builder.yml. On macOS packaged builds the window/dock icon already
// comes from `icon.icns` in the app bundle, so we only need the PNG for dev
// and for Linux/Windows window chrome.
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "..", "..", "resources", "icon.png");
const appIcon = nativeImage.createFromPath(appIconPath);

function readClipboardImageAttachment(): ComposerImageAttachment | null {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return null;
  }

  const size = image.getSize();
  if (size.width > MAX_CLIPBOARD_IMAGE_DIMENSION || size.height > MAX_CLIPBOARD_IMAGE_DIMENSION) {
    return null;
  }

  const png = image.toPNG();
  if (png.length === 0 || png.length > MAX_CLIPBOARD_IMAGE_BYTES) {
    return null;
  }

  return {
    id: randomUUID(),
    kind: "image",
    name: "pasted-image.png",
    mimeType: "image/png",
    data: png.toString("base64"),
  };
}

function cacheNewThreadAttachmentReference(attachment: ComposerAttachment): ComposerAttachment {
  pruneNewThreadAttachmentReferences();
  newThreadAttachmentReferences.set(attachment.id, attachment);
  if (attachment.kind !== "image") {
    return attachment;
  }
  return {
    ...attachment,
    data: "",
    omittedData: true,
    dataBytes: attachment.data.length,
  };
}

function sanitizeTranscriptWindowRequest(request: unknown): {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly startIndex: number;
  readonly limit: number;
} | null {
  if (!request || typeof request !== "object") {
    return null;
  }
  const record = request as Record<string, unknown>;
  const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : "";
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
  const startIndex = typeof record.startIndex === "number" && Number.isFinite(record.startIndex)
    ? Math.max(0, Math.floor(record.startIndex))
    : 0;
  const limit = typeof record.limit === "number" && Number.isFinite(record.limit)
    ? Math.max(1, Math.min(160, Math.floor(record.limit)))
    : 100;
  if (!workspaceId || !sessionId) {
    return null;
  }
  return { workspaceId, sessionId, startIndex, limit };
}

function sanitizeToolContentRequest(request: unknown): {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly callId: string;
} | null {
  if (!request || typeof request !== "object") {
    return null;
  }
  const record = request as Record<string, unknown>;
  const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : "";
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
  const callId = typeof record.callId === "string" ? record.callId : "";
  if (!workspaceId || !sessionId || !callId) {
    return null;
  }
  return { workspaceId, sessionId, callId };
}

function hydrateNewThreadAttachmentReferences(input: StartThreadInput): StartThreadInput {
  const missingReferences: string[] = [];
  const attachments = input.attachments?.map((attachment) => {
    if (attachment.kind === "image" && attachment.omittedData) {
      const referenced = newThreadAttachmentReferences.get(attachment.id);
      if (!referenced) {
        missingReferences.push(attachment.name || attachment.id);
        return attachment;
      }
      return referenced;
    }
    return attachment;
  });
  if (!attachments) {
    return input;
  }
  if (missingReferences.length > 0) {
    throw new Error(`New thread image attachment is no longer available: ${missingReferences.join(", ")}`);
  }
  for (const attachment of input.attachments ?? []) {
    if (attachment.kind === "image" && attachment.omittedData) {
      newThreadAttachmentReferences.delete(attachment.id);
    }
  }
  return { ...input, attachments };
}

function pruneNewThreadAttachmentReferences() {
  while (newThreadAttachmentReferences.size >= MAX_NEW_THREAD_ATTACHMENT_REFERENCES) {
    const firstKey = newThreadAttachmentReferences.keys().next().value as string | undefined;
    if (!firstKey) return;
    newThreadAttachmentReferences.delete(firstKey);
  }
}

function createWindow(): BrowserWindow {
  const backgroundTestMode = windowTestMode === "background";
  const enableTransparency = store ? store.state.enableTransparency : false;
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    transparent: enableTransparency,
    vibrancy: process.platform === "darwin" && enableTransparency ? "under-window" : undefined,
    titleBarStyle: "hiddenInset",
    backgroundColor: enableTransparency ? "#00000000" : "#f3f4f8",
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep hidden test windows responsive so Playwright exercises the same UI flows.
      backgroundThrottling: !backgroundTestMode,
    },
  });

  window.once("ready-to-show", () => {
    if (!backgroundTestMode) {
      window.show();
    }
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }

    const lowerKey = input.key.toLowerCase();
    const platformModifier = process.platform === "darwin" ? input.meta : input.control;
    const terminalFocused = terminalFocusedWebContentsIds.has(window.webContents.id);
    if (terminalFocused) {
      return;
    }
    if (platformModifier && !input.shift && lowerKey === "n") {
      event.preventDefault();
      createAppWindow(viewForWebContents(window.webContents.id));
      return;
    }

    if (platformModifier && !input.shift && lowerKey === "o") {
      event.preventDefault();
      void pickWorkspaceViaDialog(window);
      return;
    }

    const command = getDesktopCommandFromShortcut({
      modifier: process.platform === "darwin" ? input.meta : input.control,
      shift: input.shift,
      key: input.key,
      code: input.code,
    });
    if (command) {
      event.preventDefault();
      window.webContents.send(desktopIpc.appCommand, command);
    }
  });

  if (isDev) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL as string);
    if (process.env.PI_APP_OPEN_DEVTOOLS !== "0") {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const indexPath = path.join(__dirname, "..", "renderer", "index.html");
    void window.loadURL(pathToFileURL(indexPath).toString());
  }

  return window;
}

function viewFromState(state: DesktopAppState): WindowViewState {
  return {
    selectedWorkspaceId: state.selectedWorkspaceId,
    selectedSessionId: state.selectedSessionId,
    activeView: state.activeView,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

function resolveWindowView(sourceView?: DesktopAppViewState): WindowViewState {
  return viewFromState(store.projectStateForView({ ...viewFromState(store.state), ...sourceView }, store.state));
}

function viewForWebContents(webContentsId: number): WindowViewState {
  return windowViews.get(webContentsId) ?? viewFromState(store.state);
}

function rememberWindowView(webContentsId: number, state: DesktopAppState): void {
  windowViews.set(webContentsId, viewFromState(state));
}

function applyWindowViewToStore(webContentsId: number): void {
  store.state = store.projectStateForView(viewForWebContents(webContentsId), store.state);
}

function projectStateForWindow(
  webContentsId: number,
  state: DesktopAppState = store.state,
  view: WindowViewState = viewForWebContents(webContentsId),
  previousView: WindowViewState | undefined = windowViews.get(webContentsId),
): DesktopAppState {
  const projected = store.projectStateForView(view, state, previousView, { skipClone: true });
  if (
    projected.composerDraftSyncSource === "persist" &&
    currentComposerDraftPersistOriginWebContentsId !== undefined &&
    webContentsId !== currentComposerDraftPersistOriginWebContentsId
  ) {
    return {
      ...projected,
      composerDraftSyncSource: "remote-persist",
    };
  }
  return projected;
}

function publishStateToWindow(window: BrowserWindow, state: DesktopAppState = store.state): void {
  if (!canPublishToWindow(window)) {
    return;
  }
  const webContentsId = window.webContents.id;
  const view = webContentsId === currentWindowScopedWebContentsId ? viewFromState(state) : viewForWebContents(webContentsId);
  const projected = projectStateForWindow(webContentsId, state, view);
  rememberWindowView(webContentsId, projected);
  window.webContents.send(desktopIpc.stateChanged, projected);
}

async function publishSelectedTranscriptToWindow(window: BrowserWindow, replaceViewFor?: SessionRef): Promise<void> {
  if (!canPublishToWindow(window)) {
    return;
  }
  const webContentsId = window.webContents.id;
  const payload = await store.getSelectedTranscriptForView(viewForWebContents(webContentsId));
  if (canPublishToWindow(window)) {
    const projected = projectStateForWindow(webContentsId);
    if (payload) {
      if (projected.selectedWorkspaceId !== payload.workspaceId || projected.selectedSessionId !== payload.sessionId) {
        return;
      }
    } else if (projected.selectedSessionId) {
      return;
    }
    const shouldReplace = payload && replaceViewFor && payload.workspaceId === replaceViewFor.workspaceId && payload.sessionId === replaceViewFor.sessionId;
    window.webContents.send(desktopIpc.selectedTranscriptChanged, shouldReplace ? { ...payload, replaceView: true } : payload);
  }
}

function setActiveWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  mainWindow = window;
  notificationManager?.trackWindow(window);
  notificationPermissionService?.trackWindow(window);
}

function windowForWebContentsId(webContentsId: number): BrowserWindow | undefined {
  return [...appWindows].find((window) => !window.isDestroyed() && window.webContents.id === webContentsId);
}

function applyWindowActivation(window: BrowserWindow): void {
  const webContentsId = window.webContents.id;
  setActiveWindow(window);
  applyWindowViewToStore(webContentsId);
  store.handleWindowActivation();
  rememberWindowView(webContentsId, store.state);
}

function applyDeferredWindowActivation(): boolean {
  const webContentsId = deferredActivationWebContentsId;
  deferredActivationWebContentsId = undefined;
  if (webContentsId === undefined) {
    return false;
  }
  const window = windowForWebContentsId(webContentsId);
  if (!window || !canPublishToWindow(window)) {
    return false;
  }
  applyWindowActivation(window);
  return true;
}

function getForegroundAppWindow(): BrowserWindow | null {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && windowViews.has(focusedWindow.webContents.id) && canPublishToWindow(focusedWindow)) {
    return focusedWindow;
  }
  if (mainWindow && canPublishToWindow(mainWindow)) {
    return mainWindow;
  }
  return [...appWindows].find((window) => canPublishToWindow(window)) ?? null;
}

function getForegroundAppView(): DesktopAppViewState | undefined {
  const window = getForegroundAppWindow();
  return window ? viewForWebContents(window.webContents.id) : undefined;
}

function restoreStoreToView(view: DesktopAppViewState | undefined): void {
  if (!view) {
    return;
  }
  store.state = store.projectStateForView(view, store.state);
}

function restoreStoreToViewAndEmit(view: DesktopAppViewState | undefined): void {
  restoreStoreToView(view);
  store.emit();
}

function restoreStoreToForegroundUnlessSender(senderWebContentsId: number | undefined): void {
  const foregroundWindow = getForegroundAppWindow();
  if (!foregroundWindow) {
    return;
  }
  if (senderWebContentsId !== undefined && foregroundWindow.webContents.id === senderWebContentsId) {
    return;
  }
  restoreStoreToViewAndEmit(viewForWebContents(foregroundWindow.webContents.id));
}

function isSessionVisibleInAnotherWindow(sessionRef: SessionRef): boolean {
  for (const window of appWindows) {
    if (!canPublishToWindow(window) || window.isMinimized() || !window.isVisible()) {
      continue;
    }
    const webContentsId = window.webContents.id;
    if (webContentsId === currentWindowScopedWebContentsId) {
      continue;
    }
    const view = windowViews.get(webContentsId);
    if (
      view?.activeView === "threads" &&
      view.selectedWorkspaceId === sessionRef.workspaceId &&
      view.selectedSessionId === sessionRef.sessionId
    ) {
      return true;
    }
  }
  return false;
}

function enqueueWindowScopedAction<T>(action: () => Promise<T>): Promise<T> {
  const run = windowScopedActionQueue.then(action, action);
  windowScopedActionQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

interface WindowScopedActionOptions {
  readonly forceActiveWindow?: boolean;
}

async function runWindowScopedForWindow(
  window: BrowserWindow | null | undefined,
  action: () => Promise<DesktopAppState>,
  options: WindowScopedActionOptions = {},
): Promise<DesktopAppState> {
  return enqueueWindowScopedAction(async () => {
    const webContentsId = window && !window.isDestroyed() ? window.webContents.id : undefined;
    const foregroundWindow = getForegroundAppWindow();
    const senderIsForeground =
      Boolean(window && foregroundWindow && window.webContents.id === foregroundWindow.webContents.id);
    const windowIsFocused =
      Boolean(window && !window.isDestroyed() && window.isFocused()) ||
      senderIsForeground ||
      options.forceActiveWindow === true;
    if (window && webContentsId !== undefined) {
      if (windowIsFocused) {
        setActiveWindow(window);
      }
      applyWindowViewToStore(webContentsId);
    }

    const previousWindowScopedWebContentsId = currentWindowScopedWebContentsId;
    currentWindowScopedWebContentsId = webContentsId;
    try {
      const state = await action();
      if (!window || webContentsId === undefined) {
        return state;
      }

      const previousView = windowViews.get(webContentsId);
      const projected = projectStateForWindow(webContentsId, state, viewFromState(state), previousView);
      rememberWindowView(webContentsId, projected);
      publishStateToWindow(window, projected);
      void publishSelectedTranscriptToWindow(window);
      return projected;
    } finally {
      currentWindowScopedWebContentsId = previousWindowScopedWebContentsId;
      if (!applyDeferredWindowActivation()) {
        restoreStoreToForegroundUnlessSender(webContentsId);
      }
    }
  });
}

function runWindowScopedForEvent(
  event: IpcMainInvokeEvent,
  action: () => Promise<DesktopAppState>,
): Promise<DesktopAppState> {
  return runWindowScopedForWindow(BrowserWindow.fromWebContents(event.sender), action);
}

async function runUnscopedStateResultForWindow(
  window: BrowserWindow | null | undefined,
  action: () => Promise<DesktopAppState>,
): Promise<DesktopAppState> {
  const state = await action();
  if (!window || !canPublishToWindow(window)) {
    return state;
  }
  const webContentsId = window.webContents.id;
  const projected = projectStateForWindow(webContentsId, state);
  rememberWindowView(webContentsId, projected);
  return projected;
}

async function runWindowScopedStateResult<T extends { readonly state: DesktopAppState }>(
  window: BrowserWindow | null | undefined,
  action: () => Promise<T>,
  options: WindowScopedActionOptions = {},
): Promise<T> {
  return enqueueWindowScopedAction(async () => {
    const webContentsId = window && !window.isDestroyed() ? window.webContents.id : undefined;
    const foregroundWindow = getForegroundAppWindow();
    const senderIsForeground =
      Boolean(window && foregroundWindow && window.webContents.id === foregroundWindow.webContents.id);
    const windowIsFocused =
      Boolean(window && !window.isDestroyed() && window.isFocused()) ||
      senderIsForeground ||
      options.forceActiveWindow === true;
    if (window && webContentsId !== undefined) {
      if (windowIsFocused) {
        setActiveWindow(window);
      }
      applyWindowViewToStore(webContentsId);
    }

    const previousWindowScopedWebContentsId = currentWindowScopedWebContentsId;
    currentWindowScopedWebContentsId = webContentsId;
    try {
      const result = await action();
      if (!window || webContentsId === undefined) {
        return result;
      }

      const previousView = windowViews.get(webContentsId);
      const projected = projectStateForWindow(webContentsId, result.state, viewFromState(result.state), previousView);
      rememberWindowView(webContentsId, projected);
      publishStateToWindow(window, projected);
      void publishSelectedTranscriptToWindow(window);
      return { ...result, state: projected };
    } finally {
      currentWindowScopedWebContentsId = previousWindowScopedWebContentsId;
      if (!applyDeferredWindowActivation()) {
        restoreStoreToForegroundUnlessSender(webContentsId);
      }
    }
  });
}

function createAppWindow(sourceView?: DesktopAppViewState): BrowserWindow {
  const window = createWindow();
  const webContentsId = window.webContents.id;
  appWindows.add(window);
  windowViews.set(webContentsId, resolveWindowView(sourceView));
  setActiveWindow(window);
  themeManager.trackWindow(window);
  attachStatePublisher(window);
  attachViewedSessionTracking(window);

  window.once("closed", () => {
    appWindows.delete(window);
    windowViews.delete(webContentsId);
    terminalFocusedWebContentsIds.delete(webContentsId);
    terminalService?.disposeWebContents(webContentsId);
    void store.cancelPendingDialogsWithoutVisibleWindow((sessionRef) => isSessionVisibleInAnotherWindow(sessionRef));
    if (mainWindow === window) {
      mainWindow = [...appWindows].find((candidate) => !candidate.isDestroyed()) ?? null;
      if (mainWindow) {
        setActiveWindow(mainWindow);
        applyWindowViewToStore(mainWindow.webContents.id);
      }
    }
    if (appWindows.size === 0) {
      terminalService?.dispose();
      terminalService = undefined;
    }
  });

  return window;
}

function attachStatePublisher(window: BrowserWindow): void {
  const webContentsId = window.webContents.id;
  stopPublishingStateByWebContentsId.get(webContentsId)?.();
  stopPublishingSelectedTranscriptByWebContentsId.get(webContentsId)?.();
  const stopPublishingState = store.subscribe((state) => {
    publishStateToWindow(window, state);
    void publishSelectedTranscriptToWindow(window);
  });
  const stopPublishingSelectedTranscript = store.subscribeToSelectedTranscript((record) => {
    void publishSelectedTranscriptToWindow(window, record?.replaceView === true ? { workspaceId: record.workspaceId, sessionId: record.sessionId } : undefined);
  });
  const stopTranscriptDelta = store.subscribeToTranscriptDelta((delta) => {
    const selected = store.state.selectedWorkspaceId === delta.workspaceId && store.state.selectedSessionId === delta.sessionId;
    if (canPublishToWindow(window) && selected) {
      window.webContents.send(desktopIpc.selectedTranscriptDelta, delta);
    }
  });
  stopPublishingStateByWebContentsId.set(webContentsId, stopPublishingState);
  stopPublishingSelectedTranscriptByWebContentsId.set(webContentsId, () => {
    stopPublishingSelectedTranscript();
    stopTranscriptDelta();
  });
  let disposed = false;
  const clearPublishing = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    stopPublishingStateByWebContentsId.get(webContentsId)?.();
    stopPublishingStateByWebContentsId.delete(webContentsId);
    stopPublishingSelectedTranscriptByWebContentsId.get(webContentsId)?.();
    stopPublishingSelectedTranscriptByWebContentsId.delete(webContentsId);
  };
  window.webContents.once("render-process-gone", (_event, details) => {
    console.error(`[main] Renderer process gone: ${details.reason}`);
    // Show a native dialog so the user knows what happened
    const reasonLabels: Record<string, string> = {
      "clean-exit": "正常退出",
      "abnormal-exit": "异常退出",
      "killed": "被系统终止",
      "crashed": "进程崩溃",
      "oom": "内存不足",
    };
    const reasonLabel = reasonLabels[details.reason] ?? details.reason;
    dialog.showMessageBox({
      type: "error",
      title: "Pi 遇到了问题",
      message: `渲染进程已停止（${reasonLabel}）`,
      detail: "界面已无响应，是否重新加载？",
      buttons: ["重新加载", "关闭窗口"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        try {
          window.webContents.reload();
        } catch {
          // Ignore reload failures
        }
      } else {
        window.close();
      }
    });
  });
  // Catch unresponsive renderer before it crashes
  window.webContents.once("unresponsive", () => {
    console.error("[main] Renderer unresponsive, showing recovery dialog");
    dialog.showMessageBox({
      type: "warning",
      title: "Pi 响应较慢",
      message: "Pi 正在从后台恢复，可能需要一点时间。",
      detail: "如果持续白屏，点击重新加载。",
      buttons: ["等待", "重新加载"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 1) {
        try {
          window.webContents.reload();
        } catch {
          // Ignore reload failures
        }
      }
    });
  });
  window.once("closed", clearPublishing);
}

function attachViewedSessionTracking(window: BrowserWindow): void {
  const webContentsId = window.webContents.id;
  stopTrackingWindowActivationByWebContentsId.get(webContentsId)?.();

  const handleActivation = () => {
    if (currentWindowScopedWebContentsId !== undefined) {
      deferredActivationWebContentsId = webContentsId;
      return;
    }
    applyWindowActivation(window);
  };
  const clearTracking = () => {
    stopTrackingWindowActivationByWebContentsId.get(webContentsId)?.();
    stopTrackingWindowActivationByWebContentsId.delete(webContentsId);
  };

  window.on("focus", handleActivation);
  window.on("show", handleActivation);
  window.on("restore", handleActivation);
  window.once("closed", clearTracking);

  stopTrackingWindowActivationByWebContentsId.set(webContentsId, () => {
    window.off("focus", handleActivation);
    window.off("show", handleActivation);
    window.off("restore", handleActivation);
    window.off("closed", clearTracking);
  });
}

function canPublishToWindow(window: BrowserWindow): boolean {
  return !window.isDestroyed() && !window.webContents.isDestroyed() && !window.webContents.isCrashed();
}

function resolveWindowTestMode(): "foreground" | "background" {
  return process.env.PI_APP_TEST_MODE?.trim().toLowerCase() === "background" ? "background" : "foreground";
}

function resolveDialogWindow(parentWindow?: BrowserWindow | null): BrowserWindow | undefined {
  if (parentWindow && canPublishToWindow(parentWindow)) {
    return parentWindow;
  }
  if (mainWindow && canPublishToWindow(mainWindow)) {
    return mainWindow;
  }
  return undefined;
}

async function stateForWindow(window?: BrowserWindow | null): Promise<DesktopAppState> {
  if (window && canPublishToWindow(window)) {
    return store.getStateForView(viewForWebContents(window.webContents.id));
  }
  return store.getState();
}

async function pickWorkspacePathViaDialog(parentWindow?: BrowserWindow | null): Promise<string | undefined> {
  const window = resolveDialogWindow(parentWindow);
  const result = window
    ? await dialog.showOpenDialog(window, {
        properties: ["openDirectory"],
        title: "Open workspace folder",
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Open workspace folder",
      });
  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  return result.filePaths[0] as string;
}

async function addPickedWorkspace(window: BrowserWindow | null | undefined, workspacePath: string): Promise<DesktopAppState> {
  const nextState = await store.addWorkspace(workspacePath);
  if (!nextState.selectedWorkspaceId) {
    return nextState;
  }
  const newThreadState =
    nextState.activeView === "new-thread" ? nextState : await store.setActiveView("new-thread");
  if (window) {
    window.webContents.send(desktopIpc.workspacePicked, nextState.selectedWorkspaceId);
  }
  return newThreadState;
}

async function pickWorkspaceViaDialog(parentWindow?: BrowserWindow | null): Promise<DesktopAppState> {
  const window = resolveDialogWindow(parentWindow);
  const workspacePath = await pickWorkspacePathViaDialog(window);
  if (!workspacePath) {
    return stateForWindow(window);
  }
  return runWindowScopedForWindow(window, () => addPickedWorkspace(window, workspacePath));
}

async function runManualUpdateCheck(): Promise<void> {
  const window = mainWindow && canPublishToWindow(mainWindow) ? mainWindow : undefined;
  const result = await checkForUpdate();

  if (result.status === "update-available") {
    return;
  }

  if (result.status === "up-to-date") {
    const options: MessageBoxOptions = {
      type: "info",
      title: "pi-gui",
      message: `You're up to date on version ${result.currentVersion}.`,
      buttons: ["OK"],
    };
    if (window) {
      await dialog.showMessageBox(window, options);
    } else {
      await dialog.showMessageBox(options);
    }
    return;
  }

  const options: MessageBoxOptions = {
    type: "warning",
    title: "pi-gui",
    message: "Could not check for updates right now.",
    detail: result.message,
    buttons: ["OK"],
  };
  if (window) {
    await dialog.showMessageBox(window, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

function installApplicationMenu(): void {
  if (process.platform !== "darwin") {
    return;
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          id: CHECK_FOR_UPDATES_MENU_ITEM_ID,
          label: "Check for Updates…",
          click: () => {
            void runManualUpdateCheck();
          },
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          id: NEW_WINDOW_MENU_ITEM_ID,
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: () => {
            createAppWindow(getForegroundAppView());
          },
        },
        { type: "separator" },
        {
          id: OPEN_FOLDER_MENU_ITEM_ID,
          label: "Open Folder…",
          accelerator: "Command+O",
          click: () => {
            void pickWorkspaceViaDialog(mainWindow);
          },
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.setName("pi");

applyPreferredPiAgentDir();
applyGuiNpmPath();

const storagePaths = resolvePiGuiStoragePaths();
if (storagePaths.tempDir) {
  mkdirSync(storagePaths.tempDir, { recursive: true });
  process.env.PI_GUI_TEMP_DIR = storagePaths.tempDir;
  process.env.TEMP = storagePaths.tempDir;
  process.env.TMP = storagePaths.tempDir;
  process.env.TMPDIR = storagePaths.tempDir;
  app.setPath("temp", storagePaths.tempDir);
}
const configuredUserDataDir = storagePaths.userDataDir ?? app.getPath("userData");
mkdirSync(configuredUserDataDir, { recursive: true });
app.setPath("userData", configuredUserDataDir);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", async () => {
  if (!store) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const window = createAppWindow(getForegroundAppView());
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  // On macOS, packaged builds already render the dock icon from `icon.icns`
  // in the app bundle. In dev we override the generic Electron dock icon with
  // the real PNG so the running app looks right end-to-end.
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(appIcon);
  }

  let generateThreadTitleOverride:
    | ((workspace: WorkspaceRef, options: GenerateThreadTitleOptions) => Promise<string | null | undefined>)
    | undefined;
  let deferredThreadTitle:
    | {
        resolve: (title: string | null) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  const appearanceThemes = await loadAppearanceThemes(path.join(configuredUserDataDir, "themes"));
  const computerUseRuntimeDriverOptions = await configureComputerUseRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
  });
  store = new DesktopAppStore({
    userDataDir: configuredUserDataDir,
    initialWorkspacePaths: resolveInitialWorkspacePaths(),
    appearanceThemes,
    initialSidebarTab:
      process.env.PI_APP_DEFAULT_SIDEBAR_TAB === "projects"
        ? "projects"
        : process.env.PI_APP_DEFAULT_SIDEBAR_TAB === "conversations" || !process.env.PI_APP_TEST_MODE
          ? "conversations"
          : "projects",
    getWindow: () => mainWindow,
    shouldKeepSessionDialogs: (sessionRef) => isSessionVisibleInAnotherWindow(sessionRef),
    ...(computerUseRuntimeDriverOptions ? { driverOptions: computerUseRuntimeDriverOptions } : {}),
    generateThreadTitleOverride: async (workspace, options) => generateThreadTitleOverride?.(workspace, options),
  });
  await store.initialize();
  integratedTerminalShell = (await store.getState()).integratedTerminalShell;
  stopPruningTerminals = store.subscribe((state) => {
    integratedTerminalShell = state.integratedTerminalShell;
    const workspacePaths = state.workspaces.map((workspace) => workspace.path);
    const workspacePathSignature = workspacePaths.join("\0");
    if (workspacePathSignature !== retainedTerminalWorkspacePathSignature) {
      retainedTerminalWorkspacePathSignature = workspacePathSignature;
      terminalService?.retainWorkspacePaths(workspacePaths);
    }
  });
  installApplicationMenu();
  if (process.env.PI_APP_TEST_MODE) {
    function createDeferredSendUserMessage() {
      let resolveRelease!: () => void;
      let markStarted!: () => void;
      const release = new Promise<void>((resolve) => {
        resolveRelease = resolve;
      });
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      return { release, started, resolveRelease, markStarted };
    }

    let nextDeferredSendUserMessage: ReturnType<typeof createDeferredSendUserMessage> | undefined;
    let activeDeferredSendUserMessage: ReturnType<typeof createDeferredSendUserMessage> | undefined;
    const originalSendUserMessage = store.driver.sendUserMessage.bind(store.driver);
    store.driver.sendUserMessage = async (...args: Parameters<typeof store.driver.sendUserMessage>) => {
      const deferred = nextDeferredSendUserMessage;
      if (!deferred) {
        return originalSendUserMessage(...args);
      }

      nextDeferredSendUserMessage = undefined;
      activeDeferredSendUserMessage = deferred;
      deferred.markStarted();
      try {
        await deferred.release;
      } finally {
        if (activeDeferredSendUserMessage === deferred) {
          activeDeferredSendUserMessage = undefined;
        }
      }
    };

    Object.assign(globalThis, {
      __PI_APP_TEST_HOOKS: {
        emitSessionEvent: (event: SessionDriverEvent) => store.emitTestSessionEvent(event),
        runComputerUseLockedUseSelfTest: () => runComputerUseLockedUseSelfTest(),
        deferNextSendUserMessage: () => {
          if (nextDeferredSendUserMessage || activeDeferredSendUserMessage) {
            throw new Error("A deferred send-user-message request is already pending");
          }
          nextDeferredSendUserMessage = createDeferredSendUserMessage();
        },
        waitForDeferredSendUserMessageStarted: () => {
          const deferred = activeDeferredSendUserMessage ?? nextDeferredSendUserMessage;
          if (!deferred) {
            throw new Error("Deferred send-user-message request is unavailable");
          }
          return deferred.started;
        },
        resolveDeferredSendUserMessage: () => {
          const deferred = activeDeferredSendUserMessage ?? nextDeferredSendUserMessage;
          if (!deferred) {
            return;
          }
          nextDeferredSendUserMessage = undefined;
          deferred.resolveRelease();
        },
        setDeferredThreadTitleMode: () => {
          generateThreadTitleOverride = () =>
            new Promise<string | null>((resolve, reject) => {
              deferredThreadTitle = { resolve, reject };
            });
        },
        hasDeferredThreadTitle: () => Boolean(deferredThreadTitle),
        resolveDeferredThreadTitle: (title: string) => {
          if (!deferredThreadTitle) {
            throw new Error("Deferred thread-title request is unavailable");
          }
          const pending = deferredThreadTitle;
          deferredThreadTitle = undefined;
          pending.resolve(title);
        },
        rejectDeferredThreadTitle: () => {
          if (!deferredThreadTitle) {
            throw new Error("Deferred thread-title request is unavailable");
          }
          const pending = deferredThreadTitle;
          deferredThreadTitle = undefined;
          pending.reject(new Error("Deferred thread-title rejected by test"));
        },
      },
    });
  }
  notificationPermissionService = new NotificationPermissionService(() => mainWindow);
  notificationPermissionService.subscribe((status) => {
    for (const window of appWindows) {
      if (canPublishToWindow(window)) {
        window.webContents.send(desktopIpc.notificationPermissionStatusChanged, status);
      }
    }
  });
  notificationManager = new NotificationManager(
    store,
    () => mainWindow,
    notificationPermissionService,
    async (sessionRef) => {
      const window = getForegroundAppWindow();
      await runWindowScopedForWindow(window, () => store.selectSession(sessionRef), { forceActiveWindow: true });
    },
  );
  stopNotifications = notificationManager.start();
  stopMobileSync = new MobileSyncService(store).start();
  if (!isDev) {
    stopUpdateChecker = initUpdateChecker();
  }

  ipcMain.handle(desktopIpc.ping, () =>
    devReloadMarkersEnabled ? `pi desktop ready:${MAIN_DEV_RELOAD_MARKER}` : "pi desktop ready",
  );
  ipcMain.handle(desktopIpc.getThemeMode, () => themeManager.getMode());
  ipcMain.handle(desktopIpc.getResolvedTheme, () => themeManager.getResolvedTheme());
  ipcMain.handle(desktopIpc.setThemeMode, (_event, mode: ThemeMode) => {
    themeManager.setMode(mode);
    return mode;
  });
  ipcMain.handle(desktopIpc.openExternal, (_event, url: string) => {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Refusing to open unsupported URL: ${url}`);
    }
    return shell.openExternal(url);
  });
  ipcMain.handle(desktopIpc.stateRequest, (event) => store.getStateForView(viewForWebContents(event.sender.id)));
  ipcMain.handle(desktopIpc.selectedTranscriptRequest, (event) =>
    store.getSelectedTranscriptForView(viewForWebContents(event.sender.id)),
  );
  ipcMain.handle(desktopIpc.selectedTranscriptWindowRequest, (event, request) => {
    const safeRequest = sanitizeTranscriptWindowRequest(request);
    if (!safeRequest) {
      return null;
    }
    return store.getSelectedTranscriptWindowForView(viewForWebContents(event.sender.id), safeRequest);
  });
  ipcMain.handle(desktopIpc.toolContentRequest, (event, request) => {
    const safeRequest = sanitizeToolContentRequest(request);
    if (!safeRequest) {
      return null;
    }
    return store.getToolContentForView(viewForWebContents(event.sender.id), safeRequest);
  });
  ipcMain.handle(desktopIpc.addWorkspacePath, (event, workspacePath: string) =>
    runWindowScopedForEvent(event, () => store.addWorkspace(workspacePath)),
  );
  ipcMain.handle(desktopIpc.pickWorkspace, (event) =>
    pickWorkspaceViaDialog(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle(desktopIpc.selectWorkspace, (event, workspaceId: string) =>
    runWindowScopedForEvent(event, () => store.selectWorkspace(workspaceId)),
  );
  ipcMain.handle(desktopIpc.renameWorkspace, (event, workspaceId: string, displayName: string) =>
    runWindowScopedForEvent(event, () => store.renameWorkspace(workspaceId, displayName)),
  );
  ipcMain.handle(desktopIpc.removeWorkspace, (event, workspaceId: string) =>
    runWindowScopedForEvent(event, () => store.removeWorkspace(workspaceId)),
  );
  ipcMain.handle(desktopIpc.reorderWorkspaces, (event, order: readonly string[]) =>
    runWindowScopedForEvent(event, () => store.reorderWorkspaces(order)),
  );
  ipcMain.handle(desktopIpc.openWorkspaceInFinder, async (_event, workspaceId: string) => {
    const workspacePath = store.getWorkspacePath(workspaceId);
    if (!workspacePath) {
      throw new Error(`Unknown workspace: ${workspaceId}`);
    }
    await shell.openPath(workspacePath);
  });
  ipcMain.handle(desktopIpc.createWorktree, (event, input: CreateWorktreeInput) =>
    runWindowScopedForEvent(event, () => store.createWorktree(input)),
  );
  ipcMain.handle(desktopIpc.removeWorktree, (event, input: RemoveWorktreeInput) =>
    runWindowScopedForEvent(event, () => store.removeWorktree(input)),
  );
  ipcMain.handle(desktopIpc.syncCurrentWorkspace, (event) =>
    runWindowScopedForEvent(event, () => store.syncCurrentWorkspace()),
  );
  ipcMain.handle(desktopIpc.selectSession, (event, target: WorkspaceSessionTarget) =>
    runWindowScopedForEvent(event, () => store.selectSession(target)),
  );
  ipcMain.handle(desktopIpc.renameSession, (event, target: WorkspaceSessionTarget, title: string) =>
    runWindowScopedForEvent(event, () => store.renameSession(target, title)),
  );
  ipcMain.handle(desktopIpc.archiveSession, (event, target: WorkspaceSessionTarget) =>
    runWindowScopedForEvent(event, () => store.archiveSession(target)),
  );
  ipcMain.handle(desktopIpc.unarchiveSession, (event, target: WorkspaceSessionTarget) =>
    runWindowScopedForEvent(event, () => store.unarchiveSession(target)),
  );
  ipcMain.handle(desktopIpc.setActiveView, (event, activeView) =>
    runWindowScopedForEvent(event, () => store.setActiveView(activeView)),
  );
  ipcMain.handle(desktopIpc.setSidebarCollapsed, (event, collapsed: boolean) =>
    runWindowScopedForEvent(event, () => store.setSidebarCollapsed(collapsed)),
  );
  ipcMain.handle(desktopIpc.setSidebarTab, (event, tab: SidebarTab) =>
    runWindowScopedForEvent(event, () => store.setSidebarTab(tab)),
  );
  ipcMain.handle(desktopIpc.setAppearanceTheme, (event, theme: AppearanceThemeId) =>
    runWindowScopedForEvent(event, () => store.setAppearanceTheme(theme)),
  );
  ipcMain.handle(desktopIpc.createConversationGroup, (event, name: string) =>
    runWindowScopedForEvent(event, () => store.createConversationGroup(name)),
  );
  ipcMain.handle(desktopIpc.renameConversationGroup, (event, groupId: string, name: string) =>
    runWindowScopedForEvent(event, () => store.renameConversationGroup(groupId, name)),
  );
  ipcMain.handle(desktopIpc.deleteConversationGroup, (event, groupId: string) =>
    runWindowScopedForEvent(event, () => store.deleteConversationGroup(groupId)),
  );
  ipcMain.handle(
    desktopIpc.assignConversationToGroup,
    (event, target: ConversationSessionRef, groupId?: string) =>
      runWindowScopedForEvent(event, () => store.assignConversationToGroup(target, groupId)),
  );
  ipcMain.handle(desktopIpc.refreshRuntime, (event, workspaceId?: string) =>
    runWindowScopedForEvent(event, () => store.refreshRuntime(workspaceId)),
  );
  ipcMain.handle(desktopIpc.setModelSettingsScopeMode, (event, mode) =>
    runWindowScopedForEvent(event, () => store.setModelSettingsScopeMode(mode)),
  );
  ipcMain.handle(desktopIpc.setSessionModel, (event, workspaceId: string, sessionId: string, provider: string, modelId: string) =>
    runWindowScopedForEvent(event, () => store.setSessionModel({ workspaceId, sessionId }, provider, modelId)),
  );
  ipcMain.handle(desktopIpc.setDefaultModel, (event, workspaceId: string, provider: string, modelId: string) =>
    runWindowScopedForEvent(event, () => store.setDefaultModel(workspaceId, provider, modelId)),
  );
  ipcMain.handle(
    desktopIpc.setDefaultThinkingLevel,
    (event, workspaceId: string, thinkingLevel) =>
      runWindowScopedForEvent(event, () => store.setDefaultThinkingLevel(workspaceId, thinkingLevel)),
  );
  ipcMain.handle(
    desktopIpc.setSessionThinkingLevel,
    (event, workspaceId: string, sessionId: string, thinkingLevel) =>
      runWindowScopedForEvent(event, () => store.setSessionThinkingLevel({ workspaceId, sessionId }, thinkingLevel)),
  );
  ipcMain.handle(desktopIpc.loginProvider, (event, workspaceId: string, providerId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return runUnscopedStateResultForWindow(window, () =>
      store.loginProvider(workspaceId, providerId, createRuntimeLoginCallbacks(window)),
    );
  });
  ipcMain.handle(desktopIpc.logoutProvider, (event, workspaceId: string, providerId: string) =>
    runWindowScopedForEvent(event, () => store.logoutProvider(workspaceId, providerId)),
  );
  ipcMain.handle(desktopIpc.setProviderApiKey, (event, workspaceId: string, providerId: string, apiKey: string) =>
    runWindowScopedForEvent(event, () => store.setProviderApiKey(workspaceId, providerId, apiKey)),
  );
  ipcMain.handle(desktopIpc.discoverThirdPartyModels, (_event, input: ThirdPartyModelDiscoveryInput) =>
    store.discoverThirdPartyModels(input),
  );
  ipcMain.handle(desktopIpc.saveThirdPartyModelProvider, (event, workspaceId: string, input: ThirdPartyModelProviderInput) =>
    runWindowScopedForEvent(event, () => store.saveThirdPartyModelProvider(workspaceId, input)),
  );
  ipcMain.handle(desktopIpc.setEnableSkillCommands, (event, workspaceId: string, enabled: boolean) =>
    runWindowScopedForEvent(event, () => store.setEnableSkillCommands(workspaceId, enabled)),
  );
  ipcMain.handle(desktopIpc.setScopedModelPatterns, (event, workspaceId: string, patterns: readonly string[]) =>
    runWindowScopedForEvent(event, () => store.setScopedModelPatterns(workspaceId, patterns)),
  );
  ipcMain.handle(desktopIpc.setSkillEnabled, (event, workspaceId: string, filePath: string, enabled: boolean) =>
    runWindowScopedForEvent(event, () => store.setSkillEnabled(workspaceId, filePath, enabled)),
  );
  ipcMain.handle(desktopIpc.setExtensionEnabled, (event, workspaceId: string, filePath: string, enabled: boolean) =>
    runWindowScopedForEvent(event, () => store.setExtensionEnabled(workspaceId, filePath, enabled)),
  );
  ipcMain.handle(desktopIpc.respondToHostUiRequest, (event, workspaceId: string, sessionId: string, response) =>
    runWindowScopedForEvent(event, () => store.respondToHostUiRequest({ workspaceId, sessionId }, response)),
  );
  ipcMain.handle(desktopIpc.setNotificationPreferences, (event, preferences) =>
    runWindowScopedForEvent(event, () => store.setNotificationPreferences(preferences)),
  );
  ipcMain.handle(desktopIpc.setMobileSyncSettings, (event, settings: MobileSyncSettings) =>
    runWindowScopedForEvent(event, () => store.setMobileSyncSettings(settings)),
  );
  ipcMain.handle(desktopIpc.setDifyConfig, (event, config: import("../src/desktop-state").DifyConfig) =>
    runWindowScopedForEvent(event, () => store.setDifyConfig(config)),
  );
  ipcMain.handle(desktopIpc.setCliTools, (event, tools: readonly import("../src/desktop-state").CliToolConfig[]) =>
    runWindowScopedForEvent(event, () => store.setCliTools(tools)),
  );
  ipcMain.handle(desktopIpc.generateMobileSyncPairQrCode, async (_event, relayUrl: string) => {
    // Call relay API to create a pair token
    const desktopWsUrl = normalizeDesktopRelayUrl(relayUrl);
    const apiUrl = desktopWsUrl
      .replace(/\/ws\/desktop$/, "")
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:")
      .replace(/\/+$/, "");
    const response = await fetch(`${apiUrl}/api/pair/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: `pi-gui-${os.hostname() ?? "desktop"}` }),
    });
    if (!response.ok) {
      throw new Error(`Relay API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { pairToken?: string };
    if (!data.pairToken) {
      throw new Error("Relay did not return a pair token");
    }
    const mobileWsUrl = desktopWsUrl.replace("/ws/desktop", "/ws/mobile");
    const qrData = `pi-gui://pair?relay=${encodeURIComponent(mobileWsUrl)}&token=${encodeURIComponent(data.pairToken)}`;
    const qrImage = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return { pairToken: data.pairToken, qrImage, qrData };
  });
  ipcMain.handle(desktopIpc.setIntegratedTerminalShell, (event, shellPath: string) =>
    runWindowScopedForEvent(event, () => store.setIntegratedTerminalShell(shellPath)),
  );
  ipcMain.handle(desktopIpc.setEnableTransparency, async (event, enabled: boolean) => {
    const nextState = await store.setEnableTransparency(enabled);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !window.isDestroyed()) {
      if (process.platform === "darwin") {
        window.setVibrancy(enabled ? "under-window" : null);
      }
    }
    return runUnscopedStateResultForWindow(window, () => Promise.resolve(nextState));
  });
  ipcMain.handle(desktopIpc.setBackgroundGradientIntensity, (event, value: number) =>
    runWindowScopedForEvent(event, () => store.setBackgroundGradientIntensity(value)),
  );
  ipcMain.handle(desktopIpc.setComponentDock, (event, componentDock: ComponentDockState) =>
    runWindowScopedForEvent(event, () => store.setComponentDock(componentDock)),
  );
  ipcMain.handle(desktopIpc.setDevelopmentModePresets, (event, presets: readonly import("../src/desktop-state").DevelopmentModePreset[]) =>
    runWindowScopedForEvent(event, () => store.setDevelopmentModePresets(presets)),
  );
  ipcMain.handle(desktopIpc.setActiveDevelopmentModePresetId, (event, id: string | null) =>
    runWindowScopedForEvent(event, () => store.setActiveDevelopmentModePresetId(id)),
  );
  ipcMain.handle(desktopIpc.setAppMode, (event, mode: "chat" | "development") =>
    runWindowScopedForEvent(event, () => store.setAppMode(mode)),
  );
  ipcMain.handle(desktopIpc.saveDockComponentDefinition, (event, definition: DockComponentDefinition, pinned: boolean) =>
    runWindowScopedForEvent(event, () => store.saveDockComponentDefinition(definition, pinned)),
  );
  ipcMain.handle(desktopIpc.generateDockComponentDefinition, (_event, input: DockComponentGenerationInput) =>
    store.generateDockComponentDefinition(input),
  );
  ipcMain.handle(desktopIpc.setWorkspaceSessionCategories, (event, workspaceId: string, categories: readonly SessionCategoryNode[]) =>
    runWindowScopedForEvent(event, () => store.setWorkspaceSessionCategories(workspaceId, categories)),
  );
  ipcMain.handle(desktopIpc.terminalEnsurePanel, (event, workspaceId: string, terminalScopeId: string, size) => {
    return getTerminalService().ensurePanel(event.sender, workspaceId, terminalScopeId, size);
  });
  ipcMain.handle(desktopIpc.terminalCreateSession, (event, workspaceId: string, terminalScopeId: string, size) => {
    return getTerminalService().createSession(event.sender, workspaceId, terminalScopeId, size);
  });
  ipcMain.handle(desktopIpc.terminalSetActiveSession, (event, workspaceId: string, terminalScopeId: string, terminalId: string) => {
    return getTerminalService().setActiveSession(event.sender, workspaceId, terminalScopeId, terminalId);
  });
  ipcMain.handle(desktopIpc.terminalWrite, (event, terminalId: string, data: string) => {
    terminalService?.write(event.sender, terminalId, data);
  });
  ipcMain.handle(desktopIpc.terminalResize, (event, terminalId: string, size) => {
    terminalService?.resize(event.sender, terminalId, size);
  });
  ipcMain.handle(desktopIpc.terminalRestartSession, (event, terminalId: string, size) => {
    return getTerminalService().restart(event.sender, terminalId, size);
  });
  ipcMain.handle(desktopIpc.terminalCloseSession, (event, terminalId: string) => {
    return getTerminalService().close(event.sender, terminalId);
  });
  ipcMain.handle(desktopIpc.terminalSetTitle, (event, terminalId: string, title: string) => {
    terminalService?.setTitle(event.sender, terminalId, title);
  });
  ipcMain.on(desktopIpc.terminalSetFocused, (event, focused: boolean) => {
    if (focused) {
      terminalFocusedWebContentsIds.add(event.sender.id);
    } else {
      terminalFocusedWebContentsIds.delete(event.sender.id);
    }
  });
  ipcMain.handle(desktopIpc.getNotificationPermissionStatus, () =>
    notificationPermissionService?.getCurrentStatus() ?? Promise.resolve("unknown"),
  );
  ipcMain.handle(desktopIpc.requestNotificationPermission, () =>
    notificationPermissionService?.requestPermission() ?? Promise.resolve("unknown"),
  );
  ipcMain.handle(desktopIpc.openSystemNotificationSettings, () =>
    notificationPermissionService?.openSystemSettings() ?? Promise.resolve(),
  );
  ipcMain.handle(desktopIpc.getComputerUseStatus, () => getComputerUseStatus());
  ipcMain.handle(desktopIpc.setLockedComputerUseEnabled, (_event, enabled: boolean) =>
    setLockedComputerUseEnabled(enabled),
  );
  ipcMain.handle(desktopIpc.openComputerUsePrivacySettings, (_event, pane) =>
    openComputerUsePrivacySettings(pane),
  );
  ipcMain.handle(desktopIpc.createSession, (event, input: CreateSessionInput) =>
    runWindowScopedForEvent(event, () => store.createSession(input)),
  );
  ipcMain.handle(desktopIpc.startThread, (event, input: StartThreadInput) =>
    runWindowScopedForEvent(event, () => store.startThread(hydrateNewThreadAttachmentReferences(input))),
  );
  ipcMain.handle(desktopIpc.openSkillInFinder, async (_event, workspaceId: string, filePath: string) => {
    const resolved = store.getSkillFilePath(workspaceId, filePath);
    if (!resolved) {
      throw new Error(`Unknown skill: ${filePath}`);
    }
    await shell.openPath(path.dirname(resolved));
  });
  ipcMain.handle(desktopIpc.openExtensionInFinder, async (_event, workspaceId: string, filePath: string) => {
    const resolved = store.getExtensionFilePath(workspaceId, filePath);
    if (!resolved) {
      throw new Error(`Unknown extension: ${filePath}`);
    }
    await shell.openPath(path.dirname(resolved));
  });
  ipcMain.handle(desktopIpc.cancelCurrentRun, (event) =>
    runWindowScopedForEvent(event, () => store.cancelCurrentRun()),
  );
  ipcMain.handle(desktopIpc.pickComposerAttachments, async (event) => {
    const window = resolveDialogWindow(BrowserWindow.fromWebContents(event.sender));
    const result =
      window
        ? await dialog.showOpenDialog(window, {
            properties: ["openFile", "multiSelections"],
            title: "Attach files",
          })
        : await dialog.showOpenDialog({
            properties: ["openFile", "multiSelections"],
            title: "Attach files",
          });
    if (result.canceled || result.filePaths.length === 0) {
      return stateForWindow(window);
    }
    const attachments = await Promise.all(result.filePaths.map(readComposerAttachment));
    return runWindowScopedForWindow(window, () => store.addComposerAttachments(attachments));
  });
  ipcMain.handle(desktopIpc.readClipboardImageReference, () => {
    const attachment = readClipboardImageAttachment();
    return attachment ? cacheNewThreadAttachmentReference(attachment) : null;
  });
  ipcMain.handle(desktopIpc.readNewThreadAttachmentPathReferences, async (_event, paths: readonly string[]) => {
    const filePaths = Array.isArray(paths)
      ? paths.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []))
      : [];
    if (filePaths.length === 0) {
      return [];
    }
    const attachments = await Promise.all(filePaths.map(readComposerAttachment));
    return attachments.map(cacheNewThreadAttachmentReference);
  });
  ipcMain.handle(desktopIpc.pasteClipboardImageToComposer, (event) => {
    const window = resolveDialogWindow(BrowserWindow.fromWebContents(event.sender));
    const attachment = readClipboardImageAttachment();
    if (!attachment) {
      return stateForWindow(window);
    }
    return runWindowScopedForEvent(event, () => store.addComposerAttachments([attachment]));
  });
  ipcMain.handle(desktopIpc.addComposerAttachmentPaths, async (event, paths: readonly string[]) => {
    const window = resolveDialogWindow(BrowserWindow.fromWebContents(event.sender));
    const filePaths = Array.isArray(paths)
      ? paths.flatMap((entry) => (typeof entry === "string" && entry.trim() ? [entry.trim()] : []))
      : [];
    if (filePaths.length === 0) {
      return stateForWindow(window);
    }
    const attachments = await Promise.all(filePaths.map(readComposerAttachment));
    return runWindowScopedForEvent(event, () => store.addComposerAttachments(attachments));
  });
  ipcMain.handle(desktopIpc.addComposerAttachments, (event, attachments: readonly ComposerAttachment[]) => {
    const validated = attachments.flatMap(validateComposerAttachmentPayload);
    return runWindowScopedForEvent(event, () => store.addComposerAttachments(validated));
  });
  ipcMain.handle(desktopIpc.removeComposerAttachment, (event, attachmentId: string) =>
    runWindowScopedForEvent(event, () => store.removeComposerAttachment(attachmentId)),
  );
  ipcMain.handle(desktopIpc.editQueuedComposerMessage, (event, messageId: string, currentDraft?: string) =>
    runWindowScopedForEvent(event, () => store.editQueuedComposerMessage(messageId, currentDraft)),
  );
  ipcMain.handle(desktopIpc.cancelQueuedComposerEdit, (event) =>
    runWindowScopedForEvent(event, () => store.cancelQueuedComposerEdit()),
  );
  ipcMain.handle(desktopIpc.removeQueuedComposerMessage, (event, messageId: string) =>
    runWindowScopedForEvent(event, () => store.removeQueuedComposerMessage(messageId)),
  );
  ipcMain.handle(desktopIpc.steerQueuedComposerMessage, (event, messageId: string) =>
    runWindowScopedForEvent(event, () => store.steerQueuedComposerMessage(messageId)),
  );
  ipcMain.handle(desktopIpc.updateComposerDraft, (event, composerDraft: string) =>
    runWindowScopedForEvent(event, async () => {
      currentComposerDraftPersistOriginWebContentsId = event.sender.id;
      try {
        return await store.updateComposerDraft(composerDraft);
      } finally {
        currentComposerDraftPersistOriginWebContentsId = undefined;
      }
    }),
  );
  ipcMain.handle(
    desktopIpc.submitComposer,
    (event, text: string, options?: { readonly deliverAs?: "steer" | "followUp" }) =>
      runWindowScopedForEvent(event, () => store.submitComposer(text, options)),
  );
  ipcMain.handle(desktopIpc.runDevelopmentOrchestration, (event) =>
    runWindowScopedForEvent(event, () => store.runDevelopmentOrchestration()),
  );
  ipcMain.handle(desktopIpc.getSessionTree, (_event, target: WorkspaceSessionTarget) =>
    store.getSessionTree(target),
  );
  ipcMain.handle(
    desktopIpc.navigateSessionTree,
    (event, target: WorkspaceSessionTarget, targetId: string, options) =>
      runWindowScopedStateResult(BrowserWindow.fromWebContents(event.sender), () =>
        store.navigateSessionTree(target, targetId, options),
      ),
  );
  ipcMain.handle(desktopIpc.listWorkspaceFiles, async (_event, workspaceId: string) => {
    const workspacePath = store.getWorkspacePath(workspaceId);
    if (!workspacePath) {
      return [];
    }
    return listWorkspaceFiles(workspacePath);
  });
  ipcMain.handle(desktopIpc.getChangedFiles, async (_event, workspaceId: string) => {
    const workspacePath = store.getWorkspacePath(workspaceId);
    if (!workspacePath) {
      return [];
    }
    return getChangedFiles(workspacePath);
  });
  ipcMain.handle(desktopIpc.getFileDiff, async (_event, workspaceId: string, filePath: string) => {
    const workspacePath = store.getWorkspacePath(workspaceId);
    if (!workspacePath) {
      return "";
    }
    return getFileDiff(workspacePath, filePath);
  });
  ipcMain.handle(desktopIpc.stageFile, async (_event, workspaceId: string, filePath: string) => {
    const workspacePath = store.getWorkspacePath(workspaceId);
    if (!workspacePath) {
      throw new Error(`Unknown workspace: ${workspaceId}`);
    }
    await stageFile(workspacePath, filePath);
  });
  ipcMain.handle(desktopIpc.toggleWindowMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });

  createAppWindow();
  void notificationPermissionService.getCurrentStatus();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow();
      void notificationPermissionService?.getCurrentStatus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopNotifications?.();
    stopNotifications = undefined;
    stopMobileSync?.();
    stopMobileSync = undefined;
    notificationManager = undefined;
    notificationPermissionService?.dispose();
    notificationPermissionService = undefined;
    stopUpdateChecker?.();
    stopUpdateChecker = undefined;
    stopPruningTerminals?.();
    stopPruningTerminals = undefined;
    terminalService?.dispose();
    terminalService = undefined;
    app.quit();
  }
});

app.on("before-quit", (event) => {
  stopNotifications?.();
  stopNotifications = undefined;
  stopMobileSync?.();
  stopMobileSync = undefined;
  notificationManager = undefined;
  notificationPermissionService?.dispose();
  notificationPermissionService = undefined;
  stopUpdateChecker?.();
  stopUpdateChecker = undefined;
  stopPruningTerminals?.();
  stopPruningTerminals = undefined;
  terminalService?.dispose();
  terminalService = undefined;
  if (quittingAfterStoreFlush || !store) {
    return;
  }

  event.preventDefault();
  quittingAfterStoreFlush = true;
  void store
    .flushPersistence()
    .catch(() => undefined)
    .finally(() => {
      app.quit();
    });
});

function resolveInitialWorkspacePaths(): readonly string[] {
  const raw = process.env.PI_APP_INITIAL_WORKSPACES;
  if (raw !== undefined) {
    return raw
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

async function readComposerAttachment(filePath: string): Promise<ComposerAttachment> {
  const mimeType = mimeTypeForPath(filePath);
  if (mimeType.startsWith("image/")) {
    return readComposerImageAttachment(filePath, mimeType);
  }

  const stats = await stat(filePath);
  return {
    id: randomUUID(),
    kind: "file",
    name: path.basename(filePath),
    mimeType,
    fsPath: filePath,
    ...(typeof stats.size === "number" ? { sizeBytes: stats.size } : {}),
  };
}

async function readComposerImageAttachment(filePath: string, mimeType: string): Promise<ComposerImageAttachment> {
  const stats = await stat(filePath);
  assertComposerImageAttachmentSize(stats.size, filePath);
  const buffer = await readFile(filePath);
  return {
    id: randomUUID(),
    kind: "image",
    name: path.basename(filePath),
    mimeType,
    data: buffer.toString("base64"),
  };
}

function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  const supported = SUPPORTED_IMAGE_TYPES.find((type) => type.extension === extension);
  if (supported) {
    return supported.mimeType;
  }
  return "application/octet-stream";
}

function validateComposerAttachmentPayload(attachment: ComposerAttachment): ComposerAttachment[] {
  if (attachment.kind === "image") {
    if (typeof attachment.data !== "string" || typeof attachment.mimeType !== "string" || !SUPPORTED_IMAGE_MIME_TYPES.has(attachment.mimeType)) {
      return [];
    }
    return [
      {
        ...attachment,
        kind: "image",
      },
    ];
  }

  if (
    attachment.kind !== "file" ||
    typeof attachment.fsPath !== "string" ||
    typeof attachment.mimeType !== "string" ||
    typeof attachment.name !== "string"
  ) {
    return [];
  }

  const normalized: ComposerFileAttachment = {
    ...attachment,
    kind: "file",
    fsPath: attachment.fsPath.trim(),
    name: attachment.name.trim() || path.basename(attachment.fsPath),
  };
  if (!normalized.fsPath) {
    return [];
  }
  return [normalized];
}

function createRuntimeLoginCallbacks(window?: BrowserWindow | null) {
  return {
    onAuth: async ({ url, instructions: _instructions }: { readonly url: string; readonly instructions?: string }) => {
      await shell.openExternal(url);
    },
    onPrompt: async ({ message, placeholder }: { readonly message: string; readonly placeholder?: string }) =>
      promptForText(window, message, placeholder),
  };
}

async function promptForText(parentWindow: BrowserWindow | null | undefined, message: string, placeholder = ""): Promise<string> {
  const window = resolveDialogWindow(parentWindow);
  if (!window) {
    throw new Error("Main window is not available for login.");
  }
  window.show();
  window.focus();
  const result = await window.webContents.executeJavaScript(
    `window.prompt(${JSON.stringify(message)}, ${JSON.stringify(placeholder)})`,
    true,
  );
  if (typeof result !== "string" || result.trim().length === 0) {
    throw new Error("Login cancelled.");
  }
  return result.trim();
}
