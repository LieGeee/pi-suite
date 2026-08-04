export type LoopStopReason = "done-marker" | "max-turns" | "stopped";

export interface LoopConfig {
  goal: string;
  maxTurns: number;
  delayMs: number;
}

export interface LoopState extends LoopConfig {
  active: boolean;
  turnsCompleted: number;
  startedAt: number;
  stopRequested: boolean;
}

export type ParsedLoopArgs = LoopConfig | { error: string };

const DEFAULT_MAX_TURNS = 20;
const DEFAULT_DELAY_MS = 2000;
const MIN_DELAY_MS = 0;
const MAX_DELAY_MS = 60_000;
const MIN_MAX_TURNS = 1;
const MAX_MAX_TURNS = 500;

export function parseLoopArgs(args: string): ParsedLoopArgs {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  let maxTurns = DEFAULT_MAX_TURNS;
  let delayMs = DEFAULT_DELAY_MS;
  const goalParts: string[] = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part === "--max") {
      const value = Number(parts[++index]);
      if (!Number.isInteger(value) || value < MIN_MAX_TURNS || value > MAX_MAX_TURNS) {
        return { error: `--max must be an integer from ${MIN_MAX_TURNS} to ${MAX_MAX_TURNS}` };
      }
      maxTurns = value;
      continue;
    }
    if (part === "--delay") {
      const value = Number(parts[++index]);
      if (!Number.isInteger(value) || value < MIN_DELAY_MS || value > MAX_DELAY_MS) {
        return { error: `--delay must be an integer from ${MIN_DELAY_MS} to ${MAX_DELAY_MS}` };
      }
      delayMs = value;
      continue;
    }
    goalParts.push(part);
  }

  const goal = goalParts.join(" ").trim();
  if (!goal) {
    return { error: "Usage: /loop [--max 20] [--delay 2000] <goal>" };
  }

  return { goal, maxTurns, delayMs };
}

export function createLoopState(config: LoopConfig): LoopState {
  return {
    ...config,
    active: true,
    turnsCompleted: 0,
    startedAt: Date.now(),
    stopRequested: false,
  };
}

export function shouldContinueLoop(
  state: LoopState,
  assistantText: string,
): { continue: true } | { continue: false; reason: LoopStopReason } {
  if (state.stopRequested) return { continue: false, reason: "stopped" };
  if (/\[LOOP:DONE\]/i.test(assistantText)) return { continue: false, reason: "done-marker" };
  if (state.turnsCompleted >= state.maxTurns) return { continue: false, reason: "max-turns" };
  return { continue: true };
}

export function buildLoopContinuationPrompt(state: LoopState): string {
  return `Loop goal: ${state.goal}

Turn ${state.turnsCompleted + 1} of ${state.maxTurns}.
Continue autonomously toward the loop goal. Inspect current state, run targeted verification where useful, fix remaining issues, and keep going without asking for confirmation unless you are blocked by missing credentials, destructive risk, or unclear requirements.

If the goal is fully complete and verified, end your response with [LOOP:DONE].`;
}
