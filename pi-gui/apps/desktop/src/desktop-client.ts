import type { DesktopAppState, NormalizedTranscriptView, SelectedTranscriptRecord, TranscriptMessage } from "./desktop-state";
import type { PiDesktopApi, ToolContentRequest, TranscriptDelta, TranscriptWindowRequest } from "./ipc";
import {
  applyToolContentPatch,
  mergeTranscriptRecordIntoView,
  transcriptViewFromRecord,
} from "./transcript-view";

export interface DesktopClientInitialState {
  readonly state: DesktopAppState;
  readonly selectedTranscript: NormalizedTranscriptView | null;
}

export type DesktopClientEvent =
  | { readonly type: "state"; readonly state: DesktopAppState }
  | { readonly type: "selectedTranscript"; readonly record: SelectedTranscriptRecord | null }
  | { readonly type: "transcriptDelta"; readonly delta: TranscriptDelta };

export interface DesktopClient {
  readonly api: PiDesktopApi;
  subscribe(listener: (event: DesktopClientEvent) => void): () => void;
  loadInitialState(): Promise<DesktopClientInitialState>;
  fetchTranscriptWindow(request: TranscriptWindowRequest): Promise<SelectedTranscriptRecord | null>;
  loadTranscriptWindow(
    request: TranscriptWindowRequest,
    current: NormalizedTranscriptView | null,
  ): Promise<NormalizedTranscriptView | null>;
  fetchToolContent(request: ToolContentRequest): Promise<Extract<TranscriptMessage, { kind: "tool" }> | null>;
  loadToolContent(
    request: ToolContentRequest,
    current: NormalizedTranscriptView | null,
  ): Promise<NormalizedTranscriptView | null>;
}

export function createDesktopClient(api: PiDesktopApi): DesktopClient {
  return {
    api,
    subscribe(listener) {
      const unsubscribeState = api.onStateChanged((state) => listener({ type: "state", state }));
      const unsubscribeTranscript = api.onSelectedTranscriptChanged((record) => listener({ type: "selectedTranscript", record }));
      const unsubscribeDelta = api.onTranscriptDelta((delta) => listener({ type: "transcriptDelta", delta }));
      return () => {
        unsubscribeState();
        unsubscribeTranscript();
        unsubscribeDelta();
      };
    },
    async loadInitialState() {
      const [state, transcript] = await Promise.all([api.getState(), api.getSelectedTranscript()]);
      const selectedTranscript = transcript && transcript.workspaceId === state.selectedWorkspaceId && transcript.sessionId === state.selectedSessionId
        ? transcriptViewFromRecord(transcript)
        : null;
      return {
        state,
        selectedTranscript,
      };
    },
    fetchTranscriptWindow(request) {
      return api.getSelectedTranscriptWindow(request);
    },
    async loadTranscriptWindow(request, current) {
      const record = await api.getSelectedTranscriptWindow(request);
      return record ? mergeTranscriptRecordIntoView(current, record) : current;
    },
    fetchToolContent(request) {
      return api.getToolContent(request);
    },
    async loadToolContent(request, current) {
      const tool = await api.getToolContent(request);
      if (!tool || !current) {
        return current;
      }
      return applyToolContentPatch(current, tool);
    },
  };
}
