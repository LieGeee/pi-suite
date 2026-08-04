import { StringDecoder } from "node:string_decoder";

/**
 * Detach completed JSONL lines from an ongoing stdout chunk stream.
 *
 * The child pi process is run with `--mode json`, which frames records with
 * LF only (see the runtime's modes/rpc/jsonl.js). Because payload strings may
 * contain U+2028/U+2029, records must be split on `\n` only.
 *
 * Chunks are decoded through a StringDecoder so a multi-byte UTF-8 code point
 * that straddles a chunk boundary is never corrupted (a raw `chunk.toString()`
 * would emit U+FFFD replacement characters and later JSON.parse would silently
 * drop that record).
 *
 * The returned collector accumulates byte chunks and yields any complete lines
 * it has not yet returned. Call `flush()` once the stream ends to drain a
 * trailing partial line and complete any pending multi-byte sequence.
 */
export interface JsonLineDecoder {
  write(chunk: Buffer | string): string[];
  flush(): string[];
  readonly droppedLines: number;
  readonly droppedPreview: string | undefined;
  readonly malformedLines: number;
  readonly malformedPreview: string | undefined;
  noteMalformedLine(line: string): void;
}
export const DEFAULT_MAX_JSONL_LINE_CHARS = 8_000_000;
export function createJsonLineDecoder(
  maxLineChars: number = DEFAULT_MAX_JSONL_LINE_CHARS,
): JsonLineDecoder {
  if (!Number.isInteger(maxLineChars) || maxLineChars < 1024) {
    throw new RangeError("JSONL line limit must be an integer >= 1024.");
  }
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let droppedLines = 0;
  let droppedPreview: string | undefined;

  const dropUntilNewline = () => {
    const newlineIndex = buffer.indexOf("\n");
    const dropped = newlineIndex === -1 ? buffer : buffer.slice(0, newlineIndex);
    droppedLines++;
    if (droppedPreview === undefined) droppedPreview = dropped.slice(0, 200);
    if (newlineIndex === -1) buffer = "";
    else buffer = buffer.slice(newlineIndex + 1);
  };

  // A line whose JSON cannot be parsed is counted in index.ts (it owns JSON.parse)
  // and surfaced as a diagnostic rather than silently dropped.
  let malformedLines = 0;
  let malformedPreview: string | undefined;

  return {
    write(chunk) {
      buffer += decoder.write(chunk);
      const lines: string[] = [];
      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          if (buffer.length > maxLineChars) dropUntilNewline();
          return lines;
        }
        const line = buffer.slice(0, newlineIndex);
        if (line.length > maxLineChars) {
          droppedLines++;
          if (droppedPreview === undefined) droppedPreview = line.slice(0, 200);
        } else if (!line.trim()) {
          // Skip blank lines quietly.
        } else {
          lines.push(line);
        }
        buffer = buffer.slice(newlineIndex + 1);
      }
    },
    flush() {
      buffer += decoder.end();
      if (!buffer) return [];
      const trailing = buffer;
      buffer = "";
      if (trailing.length > maxLineChars) {
        droppedLines++;
        if (droppedPreview === undefined) droppedPreview = trailing.slice(0, 200);
        return [];
      }
      if (!trailing.trim()) return [];
      return [trailing];
    },
    get droppedLines() {
      return droppedLines;
    },
    get droppedPreview() {
      return droppedPreview;
    },
    get malformedLines() {
      return malformedLines;
    },
    get malformedPreview() {
      return malformedPreview;
    },
    noteMalformedLine(line: string) {
      malformedLines++;
      if (malformedPreview === undefined) malformedPreview = line.slice(0, 200);
    },
  };
}
