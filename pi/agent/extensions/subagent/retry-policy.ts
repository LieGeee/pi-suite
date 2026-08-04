import type { SubagentPermission } from "./permissions.js";

export const MAX_READ_ATTEMPTS = 2;
export const MIN_RETRY_DELAY_MS = 500;
export const MAX_RETRY_DELAY_MS = 1500;

export interface SubagentRetryInput {
  permission: SubagentPermission;
  attempt: number;
  exitCode: number;
  errorMessage?: string;
  stderr: string;
}

const TRANSIENT_ERROR_PATTERN =
  /\b(?:429|500|502|503|504)\b|service temporarily unavailable|service unavailable|stream[_ -]?read[_ -]?error|econnreset|connection reset|socket hang up|premature (?:close|end)|\u4e0a\u6e38\u7ec4.*\u4e0d\u53ef\u7528|upstream group.*unavailable/i;

const NON_RETRYABLE_ERROR_PATTERN = /timed out|\babort(?:ed)?\b|unknown agent|invalid parameters|policy blocked/i;

export function shouldRetrySubagent(input: SubagentRetryInput): boolean {
  if (input.permission !== "read") return false;
  if (input.attempt >= MAX_READ_ATTEMPTS) return false;
  if (input.exitCode === 0 || input.exitCode === 124) return false;

  const failureText = `${input.errorMessage ?? ""}\n${input.stderr}`;
  if (NON_RETRYABLE_ERROR_PATTERN.test(failureText)) return false;
  return TRANSIENT_ERROR_PATTERN.test(failureText);
}

export function getRetryDelayMs(random: () => number = Math.random): number {
  const bounded = Math.min(1, Math.max(0, random()));
  return Math.round(MIN_RETRY_DELAY_MS + bounded * (MAX_RETRY_DELAY_MS - MIN_RETRY_DELAY_MS));
}

export interface RetryableSubagentResult {
  exitCode: number;
  errorMessage?: string;
  stderr: string;
}

export interface SubagentRetryOutcome<T extends RetryableSubagentResult> {
  result: T;
  attempts: number;
  retryDelayMs: number;
  retryErrors: string[];
}

export interface SubagentRetryOptions {
  random?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

function createRetryAbortError(): Error {
  const error = new Error("Subagent retry was aborted during backoff.");
  error.name = "AbortError";
  return error;
}

const defaultSleep = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createRetryAbortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(createRetryAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function runWithSubagentRetry<T extends RetryableSubagentResult>(
  permission: SubagentPermission,
  runAttempt: (attempt: number) => Promise<T>,
  options: SubagentRetryOptions = {},
): Promise<SubagentRetryOutcome<T>> {
  const retryErrors: string[] = [];
  let retryDelayMs = 0;
  let attempt = 1;

  while (true) {
    if (options.signal?.aborted) throw createRetryAbortError();
    const result = await runAttempt(attempt);
    if (!shouldRetrySubagent({ permission, attempt, ...result })) {
      return { result, attempts: attempt, retryDelayMs, retryErrors };
    }

    retryErrors.push(result.errorMessage || result.stderr.trim() || `Child exited with code ${result.exitCode}.`);
    const delayMs = getRetryDelayMs(options.random);
    retryDelayMs += delayMs;
    await (options.sleep ?? defaultSleep)(delayMs, options.signal);
    attempt++;
  }
}
