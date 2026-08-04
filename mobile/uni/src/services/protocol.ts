// Protocol types for pi-gui mobile relay communication
// Adapted from S:/tool/pi/pi-mobile-client/src/protocol.ts

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'auth-failed'

export interface MobilePermissions {
  readonly taskList?: boolean
  readonly conversationDetails?: boolean
  readonly notifications?: boolean
  readonly sendMessages?: boolean
  readonly stopRuns?: boolean
  readonly createSessions?: boolean
}

export interface SessionRecord {
  readonly id: string
  readonly title: string
  readonly preview?: string
  readonly status?: 'idle' | 'running' | 'failed' | string
  readonly updatedAt?: string
  readonly hasUnseenUpdate?: boolean
}

export interface WorkspaceRecord {
  readonly id: string
  readonly name: string
  readonly path?: string
  readonly sessions?: readonly SessionRecord[]
}

export interface LegacySessionCategoryNode {
  readonly id: string
  readonly label: string
  readonly sessionIds?: readonly string[]
  readonly children?: readonly LegacySessionCategoryNode[]
}

export interface DesktopSessionCategoryNode {
  readonly id: string
  readonly name: string
  readonly sessionRefs: readonly {
    readonly workspaceId: string
    readonly sessionId: string
  }[]
  readonly children: readonly DesktopSessionCategoryNode[]
}

export interface DesktopWorkspaceSessionCategories {
  readonly version: 1
  readonly categories: readonly DesktopSessionCategoryNode[]
}

export type SessionCategoryNode = LegacySessionCategoryNode | DesktopSessionCategoryNode
export type SessionCategoriesByWorkspace = Record<
  string,
  readonly LegacySessionCategoryNode[] | DesktopWorkspaceSessionCategories
>

export interface DesktopSnapshotPayload {
  readonly version?: number
  readonly selectedWorkspaceId?: string
  readonly selectedSessionId?: string
  readonly workspaces?: readonly WorkspaceRecord[]
  readonly sessionCategoriesByWorkspace?: SessionCategoriesByWorkspace
  readonly permissions?: MobilePermissions
  readonly revision?: number
}

export interface TranscriptMessage {
  readonly kind?: string
  readonly id?: string
  readonly role?: string
  readonly text?: string
  readonly title?: string
  readonly status?: string
  readonly label?: string
  readonly detail?: string
  readonly toolName?: string
  readonly toolStatus?: string
  readonly createdAt?: string
  readonly timestamp?: string
  readonly [key: string]: unknown
}

export interface TranscriptPayload {
  readonly workspaceId: string
  readonly sessionId: string
  readonly transcript: readonly TranscriptMessage[]
}

export interface NotificationPayload {
  readonly kind?: string
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly title?: string
  readonly body?: string
  readonly timestamp?: string
}

export interface RelayEnvelope<TPayload = unknown> {
  readonly type: string
  readonly payload?: TPayload
  readonly commandId?: string
  readonly command?: string
}

export interface MobileCommandEnvelope<TPayload = unknown> extends RelayEnvelope<TPayload> {
  readonly type: 'mobile.command'
  readonly commandId: string
  readonly command: string
}

export interface TaskListItem {
  readonly workspaceId: string
  readonly workspaceName: string
  readonly workspacePath?: string
  readonly sessionId: string
  readonly title: string
  readonly preview: string
  readonly status: string
  readonly updatedAt: string
  readonly hasUnseenUpdate: boolean
}

export function sessionKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}
