import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  createInitialMobileState,
  mobileReducer,
  selectCurrentTask,
  selectTasks,
  selectTranscript,
  type MobileState,
} from "./mobile-state";
import type { MobileAction, MobileCommandEnvelope, RelayEnvelope, TaskListItem, TranscriptMessage } from "./protocol";

export interface UseMobileRelayOptions {
  readonly enabled: boolean;
  readonly relayUrl: string;
  readonly pairToken: string;
  readonly deviceName?: string;
}

export interface MobileRelayCommands {
  requestTranscript(input: { readonly workspaceId: string; readonly sessionId: string }): string | undefined;
  sendMessage(input: { readonly workspaceId: string; readonly sessionId: string; readonly text: string }): string | undefined;
  stopRun(input: { readonly workspaceId: string; readonly sessionId: string }): string | undefined;
  createSession(input: { readonly workspaceId: string; readonly title?: string; readonly prompt?: string }): string | undefined;
  selectTask(input: { readonly workspaceId: string; readonly sessionId: string }): string | undefined;
  reconnect(): void;
}

export interface MobileRelayResult {
  readonly state: MobileState;
  readonly tasks: readonly TaskListItem[];
  readonly currentTask?: TaskListItem;
  readonly transcript: readonly TranscriptMessage[];
  readonly commands: MobileRelayCommands;
}

export function useMobileRelay(options: UseMobileRelayOptions): MobileRelayResult {
  const [state, dispatch] = useReducer(mobileReducer, undefined, createInitialMobileState);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectNonceRef = useRef(0);
  const [, forceReconnectRender] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    if (!options.enabled || !options.relayUrl.trim() || !options.pairToken.trim()) {
      dispatch({ type: "socket.status", payload: { status: "idle" } });
      return;
    }

    let closedByEffect = false;
    const socket = new WebSocket(options.relayUrl.trim());
    socketRef.current = socket;
    dispatch({ type: "socket.status", payload: { status: "connecting" } });

    socket.onopen = () => {
      dispatch({ type: "socket.status", payload: { status: "connected" } });
      socket.send(JSON.stringify({
        type: "mobile.hello",
        payload: {
          pairToken: options.pairToken.trim(),
          deviceName: options.deviceName?.trim() || "Mobile Web",
        },
      }));
    };

    socket.onmessage = (event) => {
      const envelope = parseEnvelope(event.data);
      if (envelope) {
        dispatch(envelope as MobileAction);
      }
    };

    socket.onerror = () => {
      dispatch({ type: "socket.status", payload: { status: "disconnected" } });
    };

    socket.onclose = () => {
      if (!closedByEffect) {
        dispatch({ type: "socket.status", payload: { status: "disconnected" } });
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };

    return () => {
      closedByEffect = true;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [options.enabled, options.relayUrl, options.pairToken, options.deviceName, reconnectNonceRef.current]);

  const sendCommand = useCallback((command: string, payload: unknown): string | undefined => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return undefined;
    }
    const commandId = createCommandId();
    const envelope: MobileCommandEnvelope = {
      type: "mobile.command",
      commandId,
      command,
      payload,
    };
    socket.send(JSON.stringify(envelope));
    return commandId;
  }, []);

  const tasks = useMemo(() => selectTasks(state), [state]);
  const currentTask = useMemo(() => selectCurrentTask(state), [state]);
  const transcript = useMemo(
    () => selectTranscript(state, currentTask?.workspaceId, currentTask?.sessionId),
    [currentTask?.sessionId, currentTask?.workspaceId, state],
  );

  const commands = useMemo<MobileRelayCommands>(() => ({
    requestTranscript: (input) => sendCommand("command.requestTranscript", input),
    sendMessage: (input) => sendCommand("command.sendMessage", input),
    stopRun: (input) => sendCommand("command.stopRun", input),
    createSession: (input) => sendCommand("command.createSession", input),
    selectTask: (input) => sendCommand("command.selectSession", input),
    reconnect: () => {
      reconnectNonceRef.current += 1;
      forceReconnectRender();
    },
  }), [sendCommand]);

  return {
    state,
    tasks,
    currentTask,
    transcript,
    commands,
  };
}

function parseEnvelope(raw: unknown): RelayEnvelope | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return undefined;
    }
    const candidate = parsed as { readonly type?: unknown };
    return typeof candidate.type === "string" ? parsed as RelayEnvelope : undefined;
  } catch {
    return undefined;
  }
}

function createCommandId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
