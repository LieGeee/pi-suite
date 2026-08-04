import assert from "node:assert/strict";
import test from "node:test";
import type { DesktopAppState, SelectedTranscriptRecord, TranscriptMessage } from "./desktop-state";
import { createDesktopClient, type DesktopClientEvent } from "./desktop-client";
import type { PiDesktopApi, TranscriptDelta } from "./ipc";

const transcriptRecord: SelectedTranscriptRecord = {
  workspaceId: "w",
  sessionId: "s",
  transcript: [],
  startIndex: 0,
  totalCount: 0,
};

const state = {
  workspaces: [],
  selectedWorkspaceId: "w",
  selectedSessionId: "s",
  revision: 1,
} as unknown as DesktopAppState;

function createApi(): PiDesktopApi {
  return {
    getState: async () => state,
    getSelectedTranscript: async () => transcriptRecord,
    onStateChanged: () => () => {},
    onSelectedTranscriptChanged: () => () => {},
    onTranscriptDelta: () => () => {},
    getSelectedTranscriptWindow: async () => transcriptRecord,
    getToolContent: async () => null,
  } as unknown as PiDesktopApi;
}

function createSubscribableApi() {
  let stateListener: ((state: DesktopAppState) => void) | undefined;
  let transcriptListener: ((record: SelectedTranscriptRecord | null) => void) | undefined;
  let deltaListener: ((delta: TranscriptDelta) => void) | undefined;
  let unsubscribeCount = 0;
  const api = {
    ...createApi(),
    onStateChanged(listener: (state: DesktopAppState) => void) {
      stateListener = listener;
      return () => { unsubscribeCount += 1; };
    },
    onSelectedTranscriptChanged(listener: (record: SelectedTranscriptRecord | null) => void) {
      transcriptListener = listener;
      return () => { unsubscribeCount += 1; };
    },
    onTranscriptDelta(listener: (delta: TranscriptDelta) => void) {
      deltaListener = listener;
      return () => { unsubscribeCount += 1; };
    },
  } as PiDesktopApi;
  return {
    api,
    emitState: () => stateListener?.(state),
    emitTranscript: () => transcriptListener?.(transcriptRecord),
    emitDelta: () => deltaListener?.({ workspaceId: "w", sessionId: "s", messageId: "m" }),
    unsubscribeCount: () => unsubscribeCount,
  };
}

test("desktop client loads initial state with normalized transcript", async () => {
  const client = createDesktopClient(createApi());
  const initial = await client.loadInitialState();
  assert.equal(initial.state, state);
  assert.equal(initial.selectedTranscript?.workspaceId, "w");
  assert.deepEqual(initial.selectedTranscript?.messageIds, []);
});

test("desktop client discards initial transcript when it does not match selected state", async () => {
  const api = {
    ...createApi(),
    getSelectedTranscript: async () => ({ ...transcriptRecord, sessionId: "other" }),
  } as PiDesktopApi;

  const initial = await createDesktopClient(api).loadInitialState();

  assert.equal(initial.state, state);
  assert.equal(initial.selectedTranscript, null);
});

test("desktop client loads older transcript windows", async () => {
  const client = createDesktopClient(createApi());
  const record = await client.fetchTranscriptWindow({ workspaceId: "w", sessionId: "s", startIndex: 0, limit: 10 });
  assert.equal(record?.workspaceId, "w");
  const view = await client.loadTranscriptWindow({ workspaceId: "w", sessionId: "s", startIndex: 0, limit: 10 }, null);
  assert.equal(view?.workspaceId, "w");
});

test("desktop client emits typed state and transcript events", () => {
  const harness = createSubscribableApi();
  const events: DesktopClientEvent[] = [];
  const unsubscribe = createDesktopClient(harness.api).subscribe((event) => {
    events.push(event);
  });

  harness.emitState();
  harness.emitTranscript();
  harness.emitDelta();
  unsubscribe();

  assert.deepEqual(events.map((event) => event.type), ["state", "selectedTranscript", "transcriptDelta"]);
  assert.equal(events[0]?.type === "state" ? events[0].state : null, state);
  assert.equal(events[1]?.type === "selectedTranscript" ? events[1].record : null, transcriptRecord);
  assert.equal(events[2]?.type === "transcriptDelta" ? events[2].delta.messageId : null, "m");
  assert.equal(harness.unsubscribeCount(), 3);
});

test("desktop client applies loaded tool content", async () => {
  const tool: Extract<TranscriptMessage, { kind: "tool" }> = {
    kind: "tool",
    id: "tool-1",
    callId: "call-1",
    toolName: "read",
    status: "success",
    label: "Read",
    createdAt: "2026-01-01T00:00:00.000Z",
    output: "full",
  };
  const api = {
    ...createApi(),
    getToolContent: async () => tool,
  } as PiDesktopApi;
  const client = createDesktopClient(api);
  const view = {
    workspaceId: "w",
    sessionId: "s",
    messageIds: ["tool-1"],
    messagesById: { "tool-1": { ...tool, output: "preview", outputOmitted: true } },
    startIndex: 0,
    totalCount: 1,
  };

  const fetched = await client.fetchToolContent({ workspaceId: "w", sessionId: "s", callId: "call-1" });
  assert.equal(fetched?.output, "full");
  const next = await client.loadToolContent({ workspaceId: "w", sessionId: "s", callId: "call-1" }, view);
  assert.equal(next?.messagesById["tool-1"]?.kind, "tool");
  if (next?.messagesById["tool-1"]?.kind === "tool") {
    assert.equal(next.messagesById["tool-1"].output, "full");
  }
});
