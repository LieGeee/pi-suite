/**
 * Shared command-line tokenizer for slash-command argument parsing.
 *
 * Rules:
 * - Whitespace separates tokens outside quotes.
 * - Single quotes group literally (no escapes inside).
 * - Double quotes group literally except `\"` and `\\`.
 * - Outside quotes, `\` escapes only whitespace, quotes, and another `\`.
 *   A backslash before any other character is kept literally so Windows
 *   paths like C:\Users\leizh\repo are not corrupted.
 * - A trailing backslash at end of input is kept literally.
 */
export function splitCommandArgs(input: string): string[] {
  const text = input.trim();
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\" && (text[i + 1] === '"' || text[i + 1] === "\\")) {
        current += text[++i];
      } else current += char;
      continue;
    }
    // Not in quotes.
    if (char === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        current += "\\";
      } else if (next === "\\" || next === '"' || next === "'" || /\s/.test(next)) {
        current += next;
        i++;
      } else {
        current += "\\";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}
