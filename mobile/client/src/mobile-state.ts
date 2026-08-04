import type {
  ConnectionStatus,
  DesktopSnapshotPayload,
  MobileAction,
  MobilePermissions,
  NotificationPayload,
  TaskListItem,
  TranscriptMessage,
  TranscriptPayload,
} from "./protocol";
import { sessionKey } from "./protocol";

export interface MobileState {
  readonly connectionStatus: ConnectionStatus;
  readonly relayUrl: string;
  readonly pairToken: string;
  readonly selectedWorkspaceId?: string;
  readonly selectedSessionId?: string;
  readonly workspaces: NonNullable<DesktopSnapshotPayload["workspaces"]>;
  readonly permissions: MobilePermissions;
  readonly transcripts: Readonly<Record<string, readonly TranscriptMessage[]>>;
  readonly notifications: readonly NotificationPayload[];
  readonly commandErrors: readonly { readonly commandId: string; readonly error: string }[];
  readonly lastError?: string;
  readonly revision?: number;
}

export function createInitialMobileState(): MobileState {
  return {
    connectionStatus: "idle",
    relayUrl: "",
    pairToken: "",
    workspaces: [],
    permissions: {
      taskList: true,
      conversationDetails: true,
      notifications: true,
      sendMessages: false,
      stopRuns: false,
      createSessions: false,
    },
    transcripts: {},
    notifications: [],
    commandErrors: [],
  };
}

export function mobileReducer(state: MobileState, action: MobileAction): MobileState {
  switch (action.type) {
    case "socket.status": {
      const status = action.payload && "status" in action.payload ? action.payload.status : "idle";
      return {
        ...state,
        connectionStatus: status,
        lastError: status === "connected" ? undefined : state.lastError,
      };
    }
    case "server.ready":
      return {
        ...state,
        connectionStatus: "connected",
        lastError: undefined,
      };
    case "server.snapshot": {
      const nested = action.payload as { readonly type?: string; readonly payload?: DesktopSnapshotPayload } | undefined;
      return nested?.payload ? applySnapshot(state, nested.payload) : state;
    }
    case "desktop.snapshot":
      return applySnapshot(state, action.payload as DesktopSnapshotPayload);
    case "desktop.transcript":
      return applyTranscript(state, action.payload as TranscriptPayload);
    case "desktop.notification":
    case "server.notification":
      return {
        ...state,
        notifications: [action.payload as NotificationPayload, ...state.notifications].slice(0, 50),
      };
    case "command.failed": {
      const payload = action.payload as { readonly commandId?: string; readonly error?: string } | undefined;
      if (!payload?.commandId || !payload.error) {
        return state;
      }
      return {
        ...state,
        commandErrors: [{ commandId: payload.commandId, error: payload.error }, ...state.commandErrors].slice(0, 20),
        lastError: payload.error,
      };
    }
    case "server.authFailed": {
      const payload = action.payload as { readonly message?: string } | undefined;
      return {
        ...state,
        connectionStatus: "auth-failed",
        lastError: payload?.message ?? "配对鉴权失败",
      };
    }
    default:
      return state;
  }
}

export function selectTasks(state: MobileState): readonly TaskListItem[] {
  const tasks = state.workspaces.flatMap((workspace) =>
    (workspace.sessions ?? []).map((session) => ({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
      sessionId: session.id,
      title: session.title || "未命名任务",
      preview: session.preview ?? "",
      status: session.status ?? "idle",
      updatedAt: session.updatedAt ?? "",
      hasUnseenUpdate: Boolean(session.hasUnseenUpdate),
    })),
  );
  return tasks.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
}

export function selectCurrentTask(state: MobileState): TaskListItem | undefined {
  const tasks = selectTasks(state);
  if (state.selectedWorkspaceId && state.selectedSessionId) {
    return tasks.find((task) => task.workspaceId === state.selectedWorkspaceId && task.sessionId === state.selectedSessionId);
  }
  return tasks[0];
}

export function selectTranscript(state: MobileState, workspaceId?: string, sessionId?: string): readonly TranscriptMessage[] {
  if (!workspaceId || !sessionId) {
    return [];
  }
  return state.transcripts[sessionKey(workspaceId, sessionId)] ?? [];
}

function applySnapshot(state: MobileState, payload: DesktopSnapshotPayload | undefined): MobileState {
  if (!payload) {
    return state;
  }
  return {
    ...state,
    selectedWorkspaceId: payload.selectedWorkspaceId ?? state.selectedWorkspaceId,
    selectedSessionId: payload.selectedSessionId ?? state.selectedSessionId,
    workspaces: payload.workspaces ?? state.workspaces,
    permissions: {
      ...state.permissions,
      ...payload.permissions,
    },
    revision: payload.revision ?? state.revision,
  };
}

function applyTranscript(state: MobileState, payload: TranscriptPayload | undefined): MobileState {
  if (!payload?.workspaceId || !payload.sessionId) {
    return state;
  }
  return {
    ...state,
    selectedWorkspaceId: payload.workspaceId,
    selectedSessionId: payload.sessionId,
    transcripts: {
      ...state.transcripts,
      [sessionKey(payload.workspaceId, payload.sessionId)]: payload.transcript ?? [],
    },
  };
}
