import type { NormalizedTranscriptView, SelectedTranscriptRecord, TranscriptMessage } from "./desktop-state";

export function emptyTranscriptView(
  workspaceId: string,
  sessionId: string,
): NormalizedTranscriptView {
  return { workspaceId, sessionId, messageIds: [], messagesById: {}, startIndex: 0, totalCount: 0 };
}

export function transcriptViewFromRecord(record: SelectedTranscriptRecord): NormalizedTranscriptView {
  const messagesById: Record<string, TranscriptMessage> = {};
  const messageIds: string[] = [];
  for (const message of record.transcript) {
    messagesById[message.id] = message;
    messageIds.push(message.id);
  }
  return {
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    messageIds,
    messagesById,
    startIndex: record.startIndex,
    totalCount: record.totalCount,
  };
}

export function orderedMessagesFromView(view: NormalizedTranscriptView): TranscriptMessage[] {
  return view.messageIds.map((id) => view.messagesById[id]).filter(Boolean) as TranscriptMessage[];
}

export function mergeTranscriptRecordIntoView(
  current: NormalizedTranscriptView | null,
  record: SelectedTranscriptRecord,
): NormalizedTranscriptView {
  if (record.replaceView) {
    return transcriptViewFromRecord(record);
  }

  const incoming = transcriptViewFromRecord(record);
  if (!current || current.workspaceId !== incoming.workspaceId || current.sessionId !== incoming.sessionId) {
    return incoming;
  }

  const messagesById: Record<string, TranscriptMessage> = {};
  for (const id of new Set([...Object.keys(current.messagesById), ...Object.keys(incoming.messagesById)])) {
    const currentMsg = current.messagesById[id];
    const incomingMsg = incoming.messagesById[id];
    if (currentMsg && incomingMsg && currentMsg.kind === "message" && incomingMsg.kind === "message") {
      messagesById[id] = currentMsg.text.length >= incomingMsg.text.length ? currentMsg : incomingMsg;
    } else {
      messagesById[id] = incomingMsg ?? currentMsg!;
    }
  }
  const seen = new Set<string>();
  const messageIds: string[] = [];
  // Determine which view has older messages and iterate that one first
  const olderIdList = current.startIndex <= incoming.startIndex ? current.messageIds : incoming.messageIds;
  const newerIdList = current.startIndex <= incoming.startIndex ? incoming.messageIds : current.messageIds;
  for (const id of olderIdList) {
    if (seen.has(id)) continue;
    seen.add(id);
    messageIds.push(id);
  }
  for (const id of newerIdList) {
    if (seen.has(id)) continue;
    seen.add(id);
    messageIds.push(id);
  }
  return {
    workspaceId: current.workspaceId,
    sessionId: current.sessionId,
    messageIds,
    messagesById,
    startIndex: Math.min(current.startIndex, incoming.startIndex),
    totalCount: Math.max(current.totalCount, incoming.totalCount),
  };
}

export function applyToolContentPatch(
  prev: NormalizedTranscriptView,
  tool: Extract<TranscriptMessage, { kind: "tool" }>,
): NormalizedTranscriptView {
  if (!(tool.id in prev.messagesById)) {
    return prev;
  }
  return {
    ...prev,
    messagesById: { ...prev.messagesById, [tool.id]: tool },
  };
}

export function applyTranscriptDelta(
  prev: NormalizedTranscriptView,
  delta: {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly messageId: string;
    readonly textDelta?: string;
    readonly replaceMessage?: Extract<TranscriptMessage, { kind: "message" }>;
  },
): NormalizedTranscriptView {
  if (prev.workspaceId !== delta.workspaceId || prev.sessionId !== delta.sessionId) {
    if (delta.replaceMessage) {
      return {
        workspaceId: delta.workspaceId,
        sessionId: delta.sessionId,
        messageIds: [delta.replaceMessage.id],
        messagesById: { [delta.replaceMessage.id]: delta.replaceMessage },
        startIndex: 0,
        totalCount: 1,
      };
    }
    return prev;
  }

  const existing = delta.messageId in prev.messagesById;
  if (delta.replaceMessage) {
    const existingEntry = prev.messagesById[delta.replaceMessage.id];
    const existingText = existingEntry?.kind === "message" ? existingEntry.text : undefined;
    const incomingText = delta.replaceMessage.text;
    const longerText = existingText && existingText.length > incomingText.length ? existingText : incomingText;
    return {
      ...prev,
      messageIds: existing ? prev.messageIds : [...prev.messageIds, delta.replaceMessage.id],
      messagesById: {
        ...prev.messagesById,
        [delta.replaceMessage.id]: { ...delta.replaceMessage, text: longerText },
      },
      totalCount: existing ? prev.totalCount : prev.totalCount + 1,
    };
  }

  if (delta.textDelta && existing) {
    const entry = prev.messagesById[delta.messageId];
    if (entry?.kind !== "message") return prev;
    return {
      ...prev,
      messagesById: {
        ...prev.messagesById,
        [delta.messageId]: { ...entry, text: `${entry.text}${delta.textDelta}` },
      },
    };
  }

  return prev;
}
