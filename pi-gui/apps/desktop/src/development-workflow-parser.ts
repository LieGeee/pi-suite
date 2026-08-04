import type { TranscriptMessage } from "./desktop-state";

const ROLE_PATTERN = /\[(Architect|Developer|Tester|Reviewer|Fixer|Observer|Summary)\]/g;
const DEFAULT_MAX_MESSAGES = 48;
const DEFAULT_MAX_TEXT_PER_MESSAGE = 12_000;
const DEFAULT_MAX_TEXT_PER_ROLE = 4_000;

export interface AgentOutput {
  readonly role: string;
  readonly text: string;
}

export interface ParseAgentOutputsOptions {
  readonly maxMessages?: number;
  readonly maxTextPerMessage?: number;
  readonly maxTextPerRole?: number;
}

/**
 * Parse a transcript for role-labeled sections like [Architect], [Developer], etc.
 * Returns a bounded map of role → output text for the workflow side panel.
 */
export function parseAgentOutputs(
  transcript: readonly TranscriptMessage[],
  options: ParseAgentOutputsOptions = {},
): Map<string, AgentOutput> {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxTextPerMessage = options.maxTextPerMessage ?? DEFAULT_MAX_TEXT_PER_MESSAGE;
  const maxTextPerRole = options.maxTextPerRole ?? DEFAULT_MAX_TEXT_PER_ROLE;
  const outputs = new Map<string, string[]>();
  const entries = maxMessages > 0 ? transcript.slice(-maxMessages) : [];

  for (const entry of entries) {
    if (entry.kind !== "message" || entry.role !== "assistant") continue;
    const entryText = truncatePanelText(entry.text, maxTextPerMessage, "单条输出");

    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let currentRole: string | null = null;

    ROLE_PATTERN.lastIndex = 0;

    while ((match = ROLE_PATTERN.exec(entryText)) !== null) {
      if (currentRole) {
        appendRoleOutput(outputs, currentRole, entryText.slice(lastIndex, match.index).trim());
      }

      currentRole = match[1] ?? null;
      lastIndex = match.index + match[0].length;
    }

    if (currentRole) {
      appendRoleOutput(outputs, currentRole, entryText.slice(lastIndex).trim());
    }

    if (!currentRole && entryText.trim()) {
      appendRoleOutput(outputs, "Main", entryText.trim());
    }
  }

  const result = new Map<string, AgentOutput>();
  for (const [role, texts] of outputs) {
    result.set(role, {
      role,
      text: truncatePanelText(texts.join("\n\n"), maxTextPerRole, `${role} 输出`),
    });
  }

  return result;
}

function appendRoleOutput(outputs: Map<string, string[]>, role: string, text: string): void {
  if (!text) return;
  const list = outputs.get(role) ?? [];
  list.push(text);
  outputs.set(role, list);
}

function truncatePanelText(text: string, limit: number, label: string): string {
  if (limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n…[${label}过长，侧边栏已截断；完整内容仍在对话中]…`;
}
