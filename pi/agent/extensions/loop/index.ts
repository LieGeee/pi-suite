import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  buildLoopContinuationPrompt,
  createLoopState,
  parseLoopArgs,
  shouldContinueLoop,
  type LoopState,
  type LoopStopReason,
} from "./state.js";

let loopState: LoopState | null = null;
let loopTimer: NodeJS.Timeout | null = null;

function clearLoopTimer(): void {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

function stopLoop(reason: LoopStopReason, ctx: ExtensionContext): void {
  clearLoopTimer();
  if (loopState) {
    loopState.active = false;
  }
  const labels: Record<LoopStopReason, string> = {
    "done-marker": "done",
    "max-turns": "max turns reached",
    stopped: "stopped",
  };
  ctx.ui.setStatus("loop", undefined);
  ctx.ui.notify(`Loop ${labels[reason]}`, reason === "done-marker" ? "success" : "info");
  loopState = null;
}

function updateLoopStatus(ctx: ExtensionContext): void {
  if (!loopState?.active) {
    ctx.ui.setStatus("loop", undefined);
    return;
  }
  ctx.ui.setStatus("loop", `∞ ${loopState.turnsCompleted}/${loopState.maxTurns}`);
}

function getAssistantText(message: unknown): string {
  const assistant = message as AssistantMessage | undefined;
  if (!assistant || assistant.role !== "assistant" || !Array.isArray(assistant.content)) return "";
  return assistant.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function queueNextLoopTurn(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (!loopState?.active) return;
  const prompt = buildLoopContinuationPrompt(loopState);
  clearLoopTimer();
  loopTimer = setTimeout(() => {
    loopTimer = null;
    if (!loopState?.active) return;
    pi.sendUserMessage(prompt);
  }, loopState.delayMs);
  updateLoopStatus(ctx);
}

export default function loopExtension(pi: ExtensionAPI): void {
  pi.registerCommand("loop", {
    description: "Autonomously keep sending follow-up turns until done or stopped",
    handler: async (args, ctx) => {
      const parsed = parseLoopArgs(args ?? "");
      if ("error" in parsed) {
        ctx.ui.notify(parsed.error, "warning");
        return;
      }

      clearLoopTimer();
      loopState = createLoopState(parsed);
      updateLoopStatus(ctx);
      ctx.ui.notify(`Loop started: ${parsed.goal}\nmax=${parsed.maxTurns}, delay=${parsed.delayMs}ms`, "info");
      pi.sendUserMessage(buildLoopContinuationPrompt(loopState));
    },
  });

  pi.registerCommand("loop-stop", {
    description: "Stop the active loop",
    handler: async (_args, ctx) => {
      if (!loopState?.active) {
        ctx.ui.notify("No active loop", "info");
        return;
      }
      loopState.stopRequested = true;
      stopLoop("stopped", ctx);
    },
  });

  pi.registerCommand("loop-status", {
    description: "Show loop progress and goal",
    handler: async (_args, ctx) => {
      if (!loopState?.active) {
        ctx.ui.notify("No active loop", "info");
        return;
      }
      ctx.ui.notify(
        `Loop active\nGoal: ${loopState.goal}\nTurns: ${loopState.turnsCompleted}/${loopState.maxTurns}\nDelay: ${loopState.delayMs}ms`,
        "info",
      );
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!loopState?.active) return;
    loopState.turnsCompleted += 1;
    const lastAssistant = [...(event.messages ?? [])].reverse().find((message) => message.role === "assistant");
    const decision = shouldContinueLoop(loopState, getAssistantText(lastAssistant));
    if (!decision.continue) {
      stopLoop(decision.reason, ctx);
      return;
    }
    queueNextLoopTurn(pi, ctx);
  });

  pi.on("session_shutdown", async () => {
    clearLoopTimer();
    loopState = null;
  });

  pi.on("session_start", async (_event, ctx) => {
    updateLoopStatus(ctx);
  });
}
