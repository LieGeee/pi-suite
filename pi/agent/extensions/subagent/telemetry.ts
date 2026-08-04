export interface SubagentTiming {
  queuedMs: number;
  startupMs?: number;
  firstTokenMs?: number;
  modelMs: number;
  toolMs: number;
  retryDelayMs: number;
  totalMs: number;
  attempts: number;
}

export interface SubagentTimingTracker {
  queuedAtMs: number;
  startedAtMs: number;
  firstEventAtMs?: number;
  firstTokenAtMs?: number;
  assistantStartedAtMs?: number;
  activeTools: Map<string, number>;
  modelMs: number;
  toolMs: number;
  retryDelayMs: number;
}

interface SubagentEventLike {
  type?: string;
  message?: { role?: string };
  assistantMessageEvent?: { type?: string; delta?: unknown };
  toolCallId?: string;
}

export function createSubagentTimingTracker(
  queuedAtMs: number,
  startedAtMs: number,
): SubagentTimingTracker {
  return {
    queuedAtMs,
    startedAtMs,
    activeTools: new Map(),
    modelMs: 0,
    toolMs: 0,
    retryDelayMs: 0,
  };
}

export function observeSubagentEvent(
  tracker: SubagentTimingTracker,
  event: SubagentEventLike,
  nowMs: number,
): void {
  tracker.firstEventAtMs ??= nowMs;

  if (event.type === "message_start" && event.message?.role === "assistant") {
    tracker.assistantStartedAtMs ??= nowMs;
  }

  if (event.type === "message_update" && event.message?.role === "assistant") {
    const updateType = event.assistantMessageEvent?.type ?? "";
    const delta = event.assistantMessageEvent?.delta;
    if (updateType.endsWith("_delta") && (typeof delta !== "string" || delta.length > 0)) {
      tracker.firstTokenAtMs ??= nowMs;
    }
  }

  if (event.type === "message_end" && event.message?.role === "assistant") {
    if (tracker.assistantStartedAtMs !== undefined) {
      tracker.modelMs += Math.max(0, nowMs - tracker.assistantStartedAtMs);
      tracker.assistantStartedAtMs = undefined;
    }
  }

  if (event.type === "tool_execution_start" && event.toolCallId) {
    tracker.activeTools.set(event.toolCallId, nowMs);
  }

  if (event.type === "tool_execution_end" && event.toolCallId) {
    const startedAtMs = tracker.activeTools.get(event.toolCallId);
    if (startedAtMs !== undefined) {
      tracker.toolMs += Math.max(0, nowMs - startedAtMs);
      tracker.activeTools.delete(event.toolCallId);
    }
  }
}

export function recordSubagentRetry(tracker: SubagentTimingTracker, delayMs: number): void {
  tracker.retryDelayMs += Math.max(0, delayMs);
}

export function closeSubagentAttemptSpans(
  tracker: SubagentTimingTracker,
  completedAtMs: number,
): void {
  if (tracker.assistantStartedAtMs !== undefined) {
    tracker.modelMs += Math.max(0, completedAtMs - tracker.assistantStartedAtMs);
    tracker.assistantStartedAtMs = undefined;
  }
  for (const startedAtMs of tracker.activeTools.values()) {
    tracker.toolMs += Math.max(0, completedAtMs - startedAtMs);
  }
  tracker.activeTools.clear();
}

export function finishSubagentTiming(
  tracker: SubagentTimingTracker,
  completedAtMs: number,
  attempts: number,
): SubagentTiming {
  closeSubagentAttemptSpans(tracker, completedAtMs);

  return {
    queuedMs: Math.max(0, tracker.startedAtMs - tracker.queuedAtMs),
    startupMs:
      tracker.firstEventAtMs === undefined
        ? undefined
        : Math.max(0, tracker.firstEventAtMs - tracker.startedAtMs),
    firstTokenMs:
      tracker.firstTokenAtMs === undefined
        ? undefined
        : Math.max(0, tracker.firstTokenAtMs - tracker.startedAtMs),
    modelMs: tracker.modelMs,
    toolMs: tracker.toolMs,
    retryDelayMs: tracker.retryDelayMs,
    totalMs: Math.max(0, completedAtMs - tracker.queuedAtMs),
    attempts,
  };
}

function formatMilliseconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export function formatSubagentTiming(timing: SubagentTiming): string {
  const parts: string[] = [];
  if (timing.queuedMs > 0) parts.push(`queue:${formatMilliseconds(timing.queuedMs)}`);
  if (timing.startupMs !== undefined) parts.push(`start:${formatMilliseconds(timing.startupMs)}`);
  if (timing.firstTokenMs !== undefined) parts.push(`first:${formatMilliseconds(timing.firstTokenMs)}`);
  if (timing.modelMs > 0) parts.push(`model:${formatMilliseconds(timing.modelMs)}`);
  if (timing.toolMs > 0) parts.push(`tools:${formatMilliseconds(timing.toolMs)}`);
  if (timing.retryDelayMs > 0) parts.push(`retry:${formatMilliseconds(timing.retryDelayMs)}`);
  parts.push(`total:${formatMilliseconds(timing.totalMs)}`);
  if (timing.attempts > 1) parts.push(`attempts:${timing.attempts}`);
  return parts.join(" ");
}
