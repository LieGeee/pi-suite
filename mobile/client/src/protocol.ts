export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "auth-failed";

export interface MobilePermissions {
  readonly taskList?: boolean;
  readonly conversationDetails?: boolean;
  readonly notifications?: boolean;
  readonly sendMessages?: boolean;
  readonly stopRuns?: boolean;
  readonly createSessions?: boolean;
}

export interface SessionRecord {
  readonly id: string;
  readonly title: string;
  readonly preview?: string;
  readonly status?: "idle" | "running" | "failed" | string;
  readonly updatedAt?: string;
  readonly hasUnseenUpdate?: boolean;
}

export interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly path?: string;
  readonly sessions?: readonly SessionRecord[];
}

export interface DesktopSnapshotPayload {
  readonly selectedWorkspaceId?: string;
  readonly selectedSessionId?: string;
  readonly workspaces?: readonly WorkspaceRecord[];
  readonly permissions?: MobilePermissions;
  readonly revision?: number;
}

export interface TranscriptMessage {
  readonly kind?: string;
  readonly id?: string;
  readonly role?: string;
  readonly text?: string;
  readonly title?: string;
  readonly status?: string;
  readonly [key: string]: unknown;
}

export interface TranscriptPayload {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly transcript: readonly TranscriptMessage[];
}

export interface NotificationPayload {
  readonly kind?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly title?: string;
  readonly body?: string;
  readonly timestamp?: string;
}

export interface CommandResultPayload {
  readonly commandId: string;
  readonly error?: string;
}

export interface RelayEnvelope<TPayload = unknown> {
  readonly type: string;
  readonly payload?: TPayload;
  readonly commandId?: string;
  readonly command?: string;
}

export interface MobileCommandEnvelope<TPayload = unknown> extends RelayEnvelope<TPayload> {
  readonly type: "mobile.command";
  readonly commandId: string;
  readonly command: string;
}

export type MobileAction =
  | RelayEnvelope<DesktopSnapshotPayload>
  | RelayEnvelope<TranscriptPayload>
  | RelayEnvelope<NotificationPayload>
  | RelayEnvelope<CommandResultPayload>
  | RelayEnvelope<{ readonly status: ConnectionStatus }>
  | RelayEnvelope<{ readonly message?: string }>;

export interface TaskListItem {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspacePath?: string;
  readonly sessionId: string;
  readonly title: string;
  readonly preview: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly hasUnseenUpdate: boolean;
}

export function sessionKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`;
}
