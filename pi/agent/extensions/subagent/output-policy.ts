export const MAX_TOOL_OUTPUT_CHARS = 16_000;
export const MAX_TOOL_OUTPUT_LINES = 300;
export const MAX_HANDOFF_CHARS = 24_000;
export const MAX_HANDOFF_LINES = 400;
export const MAX_STDERR_CHARS = 32_000;

export interface LimitedSubagentText {
  text: string;
  truncated: boolean;
  originalChars: number;
  originalLines: number;
}

export function limitSubagentText(
  text: string,
  maxChars: number,
  maxLines: number,
): LimitedSubagentText {
  if (!Number.isInteger(maxChars) || !Number.isInteger(maxLines) || maxChars < 1 || maxLines < 1) {
    throw new RangeError("Subagent output limits must be positive integers.");
  }

  const characters = Array.from(text);
  const lines = text.split(/\r?\n/);
  const originalChars = characters.length;
  const originalLines = lines.length;
  if (originalChars <= maxChars && originalLines <= maxLines) {
    return { text, truncated: false, originalChars, originalLines };
  }

  const note = `[Subagent output truncated from ${originalChars} chars / ${originalLines} lines.]`;
  const multilineSuffix = `\n\n${note}`;
  const suffix = maxLines >= 3 ? multilineSuffix : ` ${note}`;
  const suffixChars = Array.from(suffix);
  if (suffixChars.length >= maxChars) {
    return {
      text: Array.from(note).slice(0, maxChars).join(""),
      truncated: true,
      originalChars,
      originalLines,
    };
  }

  const maxContentLines = maxLines >= 3 ? maxLines - 2 : 1;
  const lineLimited = lines.slice(0, maxContentLines).join("\n");
  const contentBudget = maxChars - suffixChars.length;
  const content = Array.from(lineLimited).slice(0, contentBudget).join("");
  return {
    text: `${content}${suffix}`,
    truncated: true,
    originalChars,
    originalLines,
  };
}

export function limitToolOutput(text: string): LimitedSubagentText {
  return limitSubagentText(text, MAX_TOOL_OUTPUT_CHARS, MAX_TOOL_OUTPUT_LINES);
}

export function limitHandoffOutput(text: string): LimitedSubagentText {
  return limitSubagentText(text, MAX_HANDOFF_CHARS, MAX_HANDOFF_LINES);
}

export interface BoundedStderrBuffer {
  append(chunk: string): void;
  readonly text: string;
}

/** Total budget in UTF-16 code units; head and tail each get up to half. */
export function createBoundedStderrBuffer(maxChars: number): BoundedStderrBuffer {
  if (!Number.isInteger(maxChars) || maxChars < 2) {
    throw new RangeError("Stderr buffer limit must be an integer >= 2.");
  }

  const half = Math.floor(maxChars / 2);
  const codePoints = (value: string) => Array.from(value);
  let head = "";
  let tail = "";
  let overflow = false;

  return {
    append(chunk) {
      if (!chunk) return;
      const points = codePoints(chunk);
      if (!overflow) {
        const room = half - codePoints(head).length;
        if (points.length <= room) {
          head += chunk;
          return;
        }
        head += points.slice(0, room).join("");
        overflow = true;
        tail = points.slice(room).slice(-half).join("");
        return;
      }
      const combined = codePoints(tail + chunk);
      tail = combined.slice(-half).join("");
    },
    get text() {
      if (!overflow) return head;
      return `${head}\n...[stderr truncated: kept first/last ${half} code points of ${codePoints(head + tail).length}+]...\n${tail}`;
    },
  };
}
