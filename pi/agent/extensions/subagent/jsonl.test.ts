import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createJsonLineDecoder } from "./jsonl.js";

describe("subagent jsonl decoder", () => {
  it("splits complete lines and keeps the partial line until flush", () => {
    const decoder = createJsonLineDecoder();
    assert.deepEqual(decoder.write(Buffer.from('{"type":"a"}\n{"type":"b"}\n{"ty', "utf8")), [
      '{"type":"a"}',
      '{"type":"b"}',
    ]);
    assert.deepEqual(decoder.flush(), ['{"ty']);
  });

  it("does not corrupt a multi-byte character split across chunk boundaries", () => {
    // "中文" is CJK: 6 UTF-8 bytes. Split the JSON line mid-character.
    const line = '{"text":"中文"}';
    const bytes = Buffer.from(line + "\n", "utf8");
    const splitAt = bytes.indexOf(0xe4); // first byte of 中
    const decoder = createJsonLineDecoder();

    // First chunk ends with only the leading byte of 中.
    const firstChunk = bytes.slice(0, splitAt + 1);
    const secondChunk = bytes.slice(splitAt + 1);
    assert.equal(decoder.write(firstChunk).length, 0);
    const lines = decoder.write(secondChunk);
    assert.equal(lines.length, 1);
    // The reconstructed line must contain the intact CJK text.
    assert.equal(lines[0], line);
    assert.equal(lines[0].includes("\uFFFD"), false);
  });

  it("handles an emoji split across two chunks without replacement chars", () => {
    // Raw UTF-8 payload containing a 4-byte emoji, with a newline frame.
    const raw = Buffer.from('{"text":"\u{1F600}"}\n', "utf8");
    const splitAt = 10; // inside the emoji's 4-byte sequence
    const decoder = createJsonLineDecoder();
    decoder.write(raw.slice(0, splitAt));
    const lines = decoder.write(raw.slice(splitAt));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes("\uFFFD"), false);
    assert.equal(JSON.parse(lines[0]).text, "\u{1F600}");
  });

  it("flush on an empty buffer returns nothing", () => {
    const decoder = createJsonLineDecoder();
    decoder.write(Buffer.from('{"a":1}\n', "utf8"));
    assert.deepEqual(decoder.flush(), []);
  });

  it("rejects oversized lines and tracks drop metadata", () => {
    const decoder = createJsonLineDecoder(1024);
    const oversized = '{"big":"' + "x".repeat(2000) + '"}';
    const lines = decoder.write(Buffer.from(oversized + "\n" + '{"ok":1}\n', "utf8"));
    assert.deepEqual(lines, ['{"ok":1}']);
    assert.equal(decoder.droppedLines, 1);
    assert.match(decoder.droppedPreview ?? "", /^\{"big"/);
  });

  it("validates the line limit argument", () => {
    assert.throws(() => createJsonLineDecoder(0), RangeError);
  });

  it("tracks malformed lines reported by the caller", () => {
    const decoder = createJsonLineDecoder();
    assert.equal(decoder.malformedLines, 0);
    decoder.noteMalformedLine("this is not json");
    decoder.noteMalformedLine("{ broken");
    assert.equal(decoder.malformedLines, 2);
    assert.match(decoder.malformedPreview ?? "", /this is not json/);
  });
});
