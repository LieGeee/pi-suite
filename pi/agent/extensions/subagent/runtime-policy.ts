import type { SubagentPermission } from "./permissions.js";

export const MIN_SUBAGENT_TIMEOUT_SECONDS = 5;
export const MAX_SUBAGENT_TIMEOUT_SECONDS = 1800;
export const DEFAULT_READ_TIMEOUT_SECONDS = 120;
export const DEFAULT_MUTATING_TIMEOUT_SECONDS = 300;

export function resolveSubagentTimeoutSeconds(
  permission: SubagentPermission,
  requested?: number,
): number {
  if (requested === undefined) {
    return permission === "read" ? DEFAULT_READ_TIMEOUT_SECONDS : DEFAULT_MUTATING_TIMEOUT_SECONDS;
  }

  if (
    !Number.isFinite(requested)
    || !Number.isInteger(requested)
    || requested < MIN_SUBAGENT_TIMEOUT_SECONDS
    || requested > MAX_SUBAGENT_TIMEOUT_SECONDS
  ) {
    throw new RangeError(
      `Subagent timeout must be an integer between ${MIN_SUBAGENT_TIMEOUT_SECONDS} and ${MAX_SUBAGENT_TIMEOUT_SECONDS} seconds.`,
    );
  }

  return requested;
}

export interface SubagentExitState {
  exitCode: number;
  finalOutput: string;
  stderr: string;
  timedOut: boolean;
  timeoutSeconds: number;
  spawnError?: string;
  stopReason?: string;
  errorMessage?: string;
}

export interface SubagentExitClassification {
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
}

interface SubagentResultStateLike {
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
}

interface SubagentDetailsLike {
  results?: readonly SubagentResultStateLike[];
}

export function hasFailedSubagentResults(details: SubagentDetailsLike | undefined): boolean {
  return Boolean(
    details?.results?.some(
      (result) =>
        result.exitCode !== -1
        && (result.exitCode !== 0
          || result.stopReason === "error"
          || result.stopReason === "aborted"
          || Boolean(result.errorMessage)),
    ),
  );
}

interface RuntimeMessageLike {
  role: string;
  content?: ReadonlyArray<{ type?: string; text?: unknown }>;
}

export type DeclaredSubagentStatus = "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";

const STATUS_VALUES = "(DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED)";
const STATUS_WORD_PATTERN = new RegExp(`^[ \t]*${STATUS_VALUES}\\b`, "i");

/**
 * Extract the final declared status from a child's output.
 *
 * Only `## Status` headings OUTSIDE fenced code blocks count, so quoting an
 * example in prose cannot mislead the result. When multiple declarations appear,
 * the LAST one wins.
 */
export function getDeclaredSubagentStatus(finalOutput: string): DeclaredSubagentStatus | undefined {
  const lines = finalOutput.split(/\r?\n/);
  let inFence = false;
  let found: DeclaredSubagentStatus | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^[ \t]*##[ \t]+Status/i);
    if (!heading) continue;

    // Inline form: `## Status: DONE` or `## Status DONE`.
    const inline = line
      .slice(heading[0].length)
      .match(new RegExp(`^[ \t]*:?[ \t]*${STATUS_VALUES}\\b`, "i"));
    if (inline) {
      found = inline[1].toUpperCase() as DeclaredSubagentStatus;
      continue;
    }
    // Block form: status on the next non-empty line.
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim()) continue;
      const word = next.match(STATUS_WORD_PATTERN);
      if (word) found = word[1].toUpperCase() as DeclaredSubagentStatus;
      break;
    }
  }

  return found;
}

export function getFinalAssistantText(messages: readonly RuntimeMessageLike[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    return (message.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");
  }
  return "";
}

export function classifySubagentExit(state: SubagentExitState): SubagentExitClassification {
  if (state.timedOut) {
    return {
      exitCode: 124,
      stopReason: "error",
      errorMessage: `Subagent timed out after ${state.timeoutSeconds} seconds.`,
    };
  }

  if (state.spawnError) {
    return {
      exitCode: 1,
      stopReason: "error",
      errorMessage: `Failed to start subagent: ${state.spawnError}`,
    };
  }

  if (state.stopReason === "error" || state.errorMessage) {
    return {
      exitCode: state.exitCode === 0 ? 1 : state.exitCode,
      stopReason: state.stopReason,
      errorMessage: state.errorMessage,
    };
  }

  const declaredStatus = getDeclaredSubagentStatus(state.finalOutput);
  if (declaredStatus === "BLOCKED" || declaredStatus === "NEEDS_CONTEXT") {
    return {
      exitCode: state.exitCode === 0 ? 1 : state.exitCode,
      stopReason: "error",
      errorMessage: `Subagent reported ${declaredStatus}.`,
    };
  }

  if (state.exitCode === 0 && !state.finalOutput.trim()) {
    return {
      exitCode: 1,
      stopReason: "error",
      errorMessage: "Subagent exited without a final assistant text response.",
    };
  }

  return { exitCode: state.exitCode };
}
