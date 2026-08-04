import type {
  ConversationGroup,
  ConversationSessionRef,
  DesktopAppState,
  SessionRecord,
  WorkspaceRecord,
} from "./desktop-state";

export interface ConversationListEntry {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceKind: WorkspaceRecord["kind"];
  readonly session: SessionRecord;
}

export function buildRecentConversations(state: Pick<DesktopAppState, "workspaces">): readonly ConversationListEntry[] {
  return state.workspaces
    .flatMap((workspace) =>
      workspace.sessions
        .filter((session) => !session.archivedAt)
        .map((session) => ({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceKind: workspace.kind,
          session,
        })),
    )
    .sort(compareConversationEntries);
}

export function sessionsForConversationGroup(
  state: Pick<DesktopAppState, "workspaces">,
  group: ConversationGroup,
): readonly ConversationListEntry[] {
  const entriesByKey = new Map(
    buildRecentConversations(state).map((entry) => [conversationRefKey({
      workspaceId: entry.workspaceId,
      sessionId: entry.session.id,
    }), entry] as const),
  );

  return group.sessions
    .map((ref) => entriesByKey.get(conversationRefKey(ref)))
    .filter((entry): entry is ConversationListEntry => Boolean(entry));
}

export function pruneConversationGroups(
  groups: readonly ConversationGroup[],
  workspaces: readonly WorkspaceRecord[],
): readonly ConversationGroup[] {
  const validKeys = new Set(
    workspaces.flatMap((workspace) =>
      workspace.sessions.map((session) => conversationRefKey({
        workspaceId: workspace.id,
        sessionId: session.id,
      })),
    ),
  );
  const assignedKeys = new Set<string>();

  return groups.map((group) => ({
    ...group,
    sessions: group.sessions.filter((ref) => {
      const key = conversationRefKey(ref);
      if (!validKeys.has(key) || assignedKeys.has(key)) {
        return false;
      }
      assignedKeys.add(key);
      return true;
    }),
  }));
}

export function conversationRefKey(ref: ConversationSessionRef): string {
  return `${ref.workspaceId}\u0000${ref.sessionId}`;
}

function compareConversationEntries(left: ConversationListEntry, right: ConversationListEntry): number {
  if (left.session.updatedAt !== right.session.updatedAt) {
    return right.session.updatedAt.localeCompare(left.session.updatedAt);
  }
  if (left.session.title !== right.session.title) {
    return left.session.title.localeCompare(right.session.title);
  }
  return left.workspaceName.localeCompare(right.workspaceName);
}
