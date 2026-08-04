import { createRequire } from "node:module";
import { join } from "node:path";
import type { SessionDriverEvent } from "@pi-gui/session-driver";
import type { DesktopAppStore } from "./app-store";
import { resolvePreferredPiAgentDir } from "./agent-dir";
import {
  activeSessionSignature,
  applyExternalRunningStatuses,
  readActiveSessionMarkers,
  type ActiveSessionMarker,
} from "./external-session-status";
import { cloneTranscriptMessageForRenderer } from "./renderer-transcript";
import type {
  DesktopAppState,
  MobileSyncConnectionStatus,
  MobileSyncPermissions,
  MobileSyncSettings,
  SelectedTranscriptRecord,
  TranscriptMessage,
  WorkspaceRecord,
  WorkspaceSessionTarget,
} from "../src/desktop-state";

interface MinimalWebSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface MinimalWebSocketConstructor {
  readonly OPEN: number;
  new (url: string): MinimalWebSocket;
}

type MobileSyncEnvelope = {
  readonly type: string;
  readonly payload?: unknown;
};

type MobileCommandEnvelope = {
  readonly type: "mobile.command";
  readonly commandId?: string;
  readonly command?: string;
  readonly payload?: unknown;
};

const require = createRequire(__filename);
const CLIENT_VERSION = 1;
const RECONNECT_DELAY_MS = 2_000;
const SNAPSHOT_DEBOUNCE_MS = 150;
const HEARTBEAT_INTERVAL_MS = 30_000;
const ACTIVE_SESSION_POLL_INTERVAL_MS = 5_000;
const ACTIVE_SESSION_MARKER_DIRECTORY = "active-sessions";
let wsPackageConstructor: MinimalWebSocketConstructor | undefined;

export class MobileSyncService {
  private socket: MinimalWebSocket | undefined;
  private stopState: (() => void) | undefined;
  private stopTranscript: (() => void) | undefined;
  private stopEvents: (() => void) | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private snapshotTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private activeSessionPollTimer: NodeJS.Timeout | undefined;
  private activeSessionPollBusy = false;
  private lastActiveSessionSignature = "";
  private latestState: DesktopAppState | undefined;
  private latestTranscript: SelectedTranscriptRecord | null = null;
  private currentConnectionKey = "";
  private authFailedConnectionKey = "";
  private stopped = true;

  constructor(private readonly store: DesktopAppStore) {}

  start(): () => void {
    if (!this.stopped) {
      return () => this.stop();
    }
    this.stopped = false;
    this.stopState = this.store.subscribe((state) => {
      this.latestState = state;
      this.applySettings(state.mobileSync);
      this.scheduleSnapshot();
    });
    this.stopTranscript = this.store.subscribeToSelectedTranscript((payload) => {
      this.latestTranscript = payload;
      if (payload) {
        this.sendTranscript(payload);
      }
    });
    this.stopEvents = this.store.subscribeToSessionEvents((event, state) => {
      this.latestState = state;
      this.sendNotificationForEvent(event, state);
    });
    return () => this.stop();
  }

  stop(): void {
    this.stopped = true;
    this.stopState?.();
    this.stopTranscript?.();
    this.stopEvents?.();
    this.stopState = undefined;
    this.stopTranscript = undefined;
    this.stopEvents = undefined;
    this.clearReconnect();
    this.clearSnapshotTimer();
    this.clearHeartbeat();
    this.closeSocket();
    this.currentConnectionKey = "";
    this.authFailedConnectionKey = "";
  }

  private applySettings(settings: MobileSyncSettings): void {
    const url = settings.serverUrl.trim();
    const pairToken = settings.pairToken.trim();
    const normalizedUrl = normalizeWebSocketUrl(url);
    const connectionKey = normalizedUrl && pairToken ? `${normalizedUrl}\n${pairToken}` : "";
    if (!connectionKey) {
      if (this.currentConnectionKey) {
        this.closeSocket();
      }
      this.currentConnectionKey = "";
      this.authFailedConnectionKey = "";
      void this.updateConnectionStatus("not-configured");
      return;
    }

    if (connectionKey === this.authFailedConnectionKey) {
      if (settings.connectionStatus === "auth-failed") {
        return;
      }
      this.authFailedConnectionKey = "";
    }

    if (connectionKey === this.currentConnectionKey) {
      return;
    }

    this.authFailedConnectionKey = "";
    this.currentConnectionKey = connectionKey;
    this.connect(normalizedUrl, pairToken);
  }

  private connect(url: string, pairToken: string): void {
    this.clearReconnect();
    this.closeSocket();
    const WebSocketConstructor = getWebSocketConstructor();
    if (!WebSocketConstructor) {
      void this.updateConnectionStatus("disconnected", "当前 Electron 运行时不支持 WebSocket。请升级运行时后再启用移动端同步。");
      return;
    }

    void this.updateConnectionStatus("connecting");
    try {
      const socket = new WebSocketConstructor(url);
      this.socket = socket;
      socket.onopen = () => {
        void this.updateConnectionStatus("connected");
        this.startHeartbeat();
        this.send({
          type: "desktop.hello",
          payload: {
            version: CLIENT_VERSION,
            pairToken,
            permissions: this.latestState?.mobileSync.permissions,
            desktopTime: new Date().toISOString(),
          },
        });
        void this.sendSnapshot();
        if (this.latestTranscript) {
          this.sendTranscript(this.latestTranscript);
        }
      };
      socket.onmessage = (event) => {
        void this.handleIncoming(event.data);
      };
      socket.onerror = () => {
        void this.updateConnectionStatus("disconnected", "移动端同步连接出错。桌面端会自动重连。");
      };
      socket.onclose = () => {
        this.clearHeartbeat();
        if (this.socket === socket) {
          this.socket = undefined;
        }
        if (!this.stopped && this.currentConnectionKey) {
          void this.updateConnectionStatus("disconnected");
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      void this.updateConnectionStatus("disconnected", error instanceof Error ? error.message : String(error));
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopped || !this.currentConnectionKey) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      const settings = this.latestState?.mobileSync;
      if (!settings?.serverUrl.trim()) {
        return;
      }
      this.connect(normalizeWebSocketUrl(settings.serverUrl), settings.pairToken.trim());
    }, RECONNECT_DELAY_MS);
  }

  private closeSocket(): void {
    this.clearHeartbeat();
    const socket = this.socket;
    this.socket = undefined;
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close(1000, "mobile sync reconfigured");
    } catch {
      // Ignore best-effort close failures.
    }
  }

  private send(envelope: MobileSyncEnvelope): void {
    if (!this.socket || this.socket.readyState !== getOpenReadyState()) {
      return;
    }
    try {
      this.socket.send(JSON.stringify(envelope));
    } catch (error) {
      void this.updateConnectionStatus("disconnected", error instanceof Error ? error.message : String(error));
    }
  }

  private scheduleSnapshot(): void {
    if (!this.latestState?.mobileSync.permissions.taskList) {
      return;
    }
    if (!this.socket || this.socket.readyState !== getOpenReadyState()) {
      return;
    }
    if (this.snapshotTimer) {
      return;
    }
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = undefined;
      void this.sendSnapshot();
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  private async loadActiveSessionMarkers(): Promise<ReadonlyMap<string, ActiveSessionMarker>> {
    const agentDir = resolvePreferredPiAgentDir();
    if (!agentDir) return new Map();
    return readActiveSessionMarkers(join(agentDir, ACTIVE_SESSION_MARKER_DIRECTORY));
  }

  private sendSnapshotWithActiveSessions(
    state: DesktopAppState,
    active: ReadonlyMap<string, ActiveSessionMarker>,
  ): void {
    this.lastActiveSessionSignature = activeSessionSignature(active);
    this.send({
      type: "desktop.snapshot",
      payload: buildSnapshotPayload(state, applyExternalRunningStatuses(state.workspaces, active)),
    });
  }

  private async sendSnapshot(): Promise<void> {
    const state = this.latestState;
    if (!state?.mobileSync.permissions.taskList) return;
    this.sendSnapshotWithActiveSessions(state, await this.loadActiveSessionMarkers());
  }

  private async refreshExternalSessionStatuses(): Promise<void> {
    if (this.activeSessionPollBusy) return;
    const state = this.latestState;
    if (!state?.mobileSync.permissions.taskList || !this.socket || this.socket.readyState !== getOpenReadyState()) return;
    this.activeSessionPollBusy = true;
    try {
      const active = await this.loadActiveSessionMarkers();
      if (activeSessionSignature(active) !== this.lastActiveSessionSignature) {
        this.sendSnapshotWithActiveSessions(state, active);
      }
    } finally {
      this.activeSessionPollBusy = false;
    }
  }

  private sendTranscript(payload: SelectedTranscriptRecord): void {
    const state = this.latestState;
    if (!state?.mobileSync.permissions.conversationDetails) {
      return;
    }
    this.send({
      type: "desktop.transcript",
      payload: {
        workspaceId: payload.workspaceId,
        sessionId: payload.sessionId,
        transcript: payload.transcript.map(sanitizeMobileTranscriptMessage),
      },
    });
  }

  private sendNotificationForEvent(event: SessionDriverEvent, state: DesktopAppState): void {
    if (!state.mobileSync.permissions.notifications) {
      return;
    }
    if (event.type !== "runCompleted" && event.type !== "runFailed" && event.type !== "hostUiRequest") {
      return;
    }
    const session = state.workspaces
      .find((workspace) => workspace.id === event.sessionRef.workspaceId)
      ?.sessions.find((candidate) => candidate.id === event.sessionRef.sessionId);
    this.send({
      type: "desktop.notification",
      payload: {
        kind: event.type,
        workspaceId: event.sessionRef.workspaceId,
        sessionId: event.sessionRef.sessionId,
        title: session?.title ?? "pi-gui 任务",
        body: bodyForEvent(event),
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async handleIncoming(raw: unknown): Promise<void> {
    let envelope: MobileCommandEnvelope | undefined;
    try {
      const parsed = JSON.parse(typeof raw === "string" ? raw : bufferLikeToString(raw));
      if (isServerAuthFailedEnvelope(parsed)) {
        this.authFailedConnectionKey = this.currentConnectionKey;
        this.currentConnectionKey = "";
        await this.updateConnectionStatus("auth-failed", parsed.payload?.message ?? "移动端同步鉴权失败。");
        this.closeSocket();
        return;
      }
      if (isMobileCommandEnvelope(parsed)) {
        envelope = parsed;
      }
    } catch {
      return;
    }
    if (!envelope) {
      return;
    }

    const commandId = envelope.commandId ?? `${Date.now()}`;
    try {
      this.assertPermission(envelope.command, this.latestState?.mobileSync.permissions);
      await this.executeCommand(envelope.command, envelope.payload);
      this.send({ type: "command.completed", payload: { commandId } });
    } catch (error) {
      this.send({
        type: "command.failed",
        payload: {
          commandId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private assertPermission(command: string | undefined, permissions: MobileSyncPermissions | undefined): void {
    if (!command) {
      throw new Error("缺少移动端命令类型。");
    }
    if (!permissions) {
      throw new Error("移动端同步尚未初始化。");
    }
    if (command === "command.createSession" && !permissions.createSessions) {
      throw new Error("移动端没有新建任务权限。");
    }
    if (command === "command.sendMessage" && !permissions.sendMessages) {
      throw new Error("移动端没有发送消息权限。");
    }
    if (command === "command.stopRun" && !permissions.stopRuns) {
      throw new Error("移动端没有停止任务权限。");
    }
    if (command === "command.requestTranscript" && !permissions.conversationDetails) {
      throw new Error("移动端没有查看对话详情权限。");
    }
    if ((command === "command.selectSession" || command === "command.markViewed") && !permissions.taskList) {
      throw new Error("移动端没有查看任务列表权限。");
    }
  }

  private async executeCommand(command: string | undefined, payload: unknown): Promise<void> {
    switch (command) {
      case "command.createSession": {
        const input = payload as Partial<{ workspaceId: string; title: string; prompt: string }>;
        if (!input.workspaceId) {
          throw new Error("新建任务需要 workspaceId。");
        }
        await this.store.createSession({ workspaceId: input.workspaceId, title: input.title });
        if (input.prompt?.trim()) {
          await this.store.submitComposer(input.prompt, { deliverAs: "followUp" });
        }
        return;
      }
      case "command.selectSession":
      case "command.markViewed": {
        await this.store.selectSession(parseSessionTarget(payload));
        return;
      }
      case "command.requestTranscript": {
        const transcript = await this.store.getTranscript(parseSessionTarget(payload));
        this.sendTranscript(transcript);
        return;
      }
      case "command.sendMessage": {
        const input = payload as Partial<{ workspaceId: string; sessionId: string; text: string; deliverAs: "steer" | "followUp" }>;
        if (!input.text?.trim()) {
          throw new Error("发送消息需要 text。");
        }
        await this.store.selectSession(parseSessionTarget(payload));
        await this.store.submitComposer(input.text, { deliverAs: input.deliverAs ?? "followUp" });
        return;
      }
      case "command.stopRun": {
        await this.store.selectSession(parseSessionTarget(payload));
        await this.store.cancelCurrentRun();
        return;
      }
      default:
        throw new Error(`不支持的移动端命令：${command ?? "unknown"}`);
    }
  }

  private async updateConnectionStatus(status: MobileSyncConnectionStatus, lastError?: string): Promise<void> {
    await this.store.setMobileSyncConnectionStatus(status, lastError);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private clearSnapshotTimer(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "desktop.heartbeat",
        payload: {
          timestamp: new Date().toISOString(),
          revision: this.latestState?.revision,
        },
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.activeSessionPollTimer = setInterval(() => {
      void this.refreshExternalSessionStatuses().catch((error) => {
        console.error("[mobile-sync] Failed to refresh active Pi sessions:", error);
      });
    }, ACTIVE_SESSION_POLL_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.activeSessionPollTimer) {
      clearInterval(this.activeSessionPollTimer);
      this.activeSessionPollTimer = undefined;
    }
    this.lastActiveSessionSignature = "";
  }
}

function buildSnapshotPayload(
  state: DesktopAppState,
  workspaces: readonly WorkspaceRecord[] = state.workspaces,
): {
  readonly version: number;
  readonly selectedWorkspaceId: string;
  readonly selectedSessionId: string;
  readonly workspaces: readonly WorkspaceRecord[];
  readonly sessionCategoriesByWorkspace: DesktopAppState["sessionCategoriesByWorkspace"];
  readonly permissions: MobileSyncPermissions;
  readonly revision: number;
} {
  return {
    version: CLIENT_VERSION,
    selectedWorkspaceId: state.selectedWorkspaceId,
    selectedSessionId: state.selectedSessionId,
    workspaces,
    sessionCategoriesByWorkspace: state.sessionCategoriesByWorkspace,
    permissions: state.mobileSync.permissions,
    revision: state.revision,
  };
}

export function sanitizeMobileTranscriptMessage(message: TranscriptMessage): TranscriptMessage {
  return cloneTranscriptMessageForRenderer(message);
}

function parseSessionTarget(payload: unknown): WorkspaceSessionTarget {
  const input = payload as Partial<WorkspaceSessionTarget>;
  if (!input.workspaceId || !input.sessionId) {
    throw new Error("移动端命令需要 workspaceId 和 sessionId。");
  }
  return {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
  };
}

function bodyForEvent(event: SessionDriverEvent): string {
  switch (event.type) {
    case "runCompleted":
      return "任务已完成";
    case "runFailed":
      return event.error.message;
    case "hostUiRequest":
      return "任务需要你确认或输入";
    default:
      return "任务有新更新";
  }
}

function normalizeWebSocketUrl(input: string): string {
  let url = input.trim();
  if (!url) {
    return "";
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

function isMobileCommandEnvelope(value: unknown): value is MobileCommandEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<MobileCommandEnvelope>;
  return candidate.type === "mobile.command";
}

function isServerAuthFailedEnvelope(value: unknown): value is {
  readonly type: "server.authFailed";
  readonly payload?: { readonly message?: string };
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { readonly type?: unknown; readonly payload?: unknown };
  if (candidate.type !== "server.authFailed") {
    return false;
  }
  if (candidate.payload !== undefined && (typeof candidate.payload !== "object" || candidate.payload === null)) {
    return false;
  }
  return true;
}

function bufferLikeToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString("utf8");
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  }
  return String(value);
}

function getWebSocketConstructor(): MinimalWebSocketConstructor | undefined {
  const candidate = (globalThis as { WebSocket?: MinimalWebSocketConstructor }).WebSocket;
  if (typeof candidate === "function") {
    return candidate;
  }
  if (wsPackageConstructor) {
    return wsPackageConstructor;
  }
  try {
    const required = require("ws") as MinimalWebSocketConstructor | { readonly WebSocket?: MinimalWebSocketConstructor };
    wsPackageConstructor = typeof required === "function" ? required : required.WebSocket;
    return wsPackageConstructor;
  } catch {
    return undefined;
  }
}

function getOpenReadyState(): number {
  return getWebSocketConstructor()?.OPEN ?? 1;
}
