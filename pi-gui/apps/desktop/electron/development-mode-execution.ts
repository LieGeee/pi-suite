import type { DevelopmentModeConfig } from "@pi-gui/pi-sdk-driver";
import type { TranscriptMessage } from "../src/desktop-state";

export function latestUserTextFromTranscript(transcript: readonly TranscriptMessage[]): string | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const entry = transcript[index];
    if (entry?.kind === "message" && entry.role === "user" && entry.text.trim()) {
      return entry.text.trim();
    }
  }
  return undefined;
}

export function shouldAutoLaunchSubagents(
  policy: DevelopmentModeConfig["subagentLaunchPolicy"],
  hasExistingUserMessage: boolean,
): boolean {
  switch (policy ?? "first-message") {
    case "every-message":
      return true;
    case "manual":
      return false;
    case "first-message":
    default:
      return !hasExistingUserMessage;
  }
}
