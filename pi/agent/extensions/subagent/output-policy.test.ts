import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBoundedStderrBuffer, limitSubagentText } from "./output-policy.js";

describe("subagent output policy", () => {
  it("preserves text within both character and line limits", () => {
    assert.deepEqual(limitSubagentText("alpha\nbeta", 100, 5), {
      text: "alpha\nbeta",
      truncated: false,
      originalChars: 10,
      originalLines: 2,
    });
  });

  it("truncates by characters and includes bounded metadata", () => {
    const result = limitSubagentText("x".repeat(500), 120, 10);
    assert.equal(result.truncated, true);
    assert.equal(Array.from(result.text).length <= 120, true);
    assert.match(result.text, /Subagent output truncated/);
    assert.equal(result.originalChars, 500);
  });

  it("truncates by lines without exceeding the returned line limit", () => {
    const result = limitSubagentText(
      Array.from({ length: 20 }, (_value, index) => `line-${index}`).join("\n"),
      1000,
      6,
    );
    assert.equal(result.truncated, true);
    assert.equal(result.text.split("\n").length <= 6, true);
    assert.match(result.text, /20 lines/);
  });

  it("does not split Unicode surrogate pairs", () => {
    const result = limitSubagentText("A😀B😀C".repeat(30), 100, 10);
    assert.equal(result.truncated, true);
    assert.equal(result.text.includes("�"), false);
    assert.equal(Array.from(result.text).length <= 100, true);
  });

  it("keeps stderr bounded by retaining the first and last chunks", () => {
    const buffer = createBoundedStderrBuffer(20);
    buffer.append("earliest");
    buffer.append("middle-".repeat(1000));
    buffer.append("latest");
    const text = buffer.text;
    assert.equal(text.length <= 20 + "earliest".length + 80, true);
    assert.match(text, /stderr truncated/);
    assert.match(text, /^earliest/);
    assert.match(text, /latest$/);
  });

  it("passes through small stderr without truncation marker", () => {
    const buffer = createBoundedStderrBuffer(100);
    buffer.append("hello");
    buffer.append(" world");
    assert.equal(buffer.text, "hello world");
    assert.equal(buffer.text.includes("truncated"), false);
  });

  it("rejects non-positive stderr limits", () => {
    assert.throws(() => createBoundedStderrBuffer(0), RangeError);
  });

  it("never splits a surrogate pair when truncating stderr", () => {
    const buffer = createBoundedStderrBuffer(8);
    buffer.append("A😀B😀C".repeat(20));
    const text = buffer.text;
    assert.equal(text.includes("\uFFFD"), false);
    // Head and tail keep only whole code points.
    const withoutMarker = text.replace(/\n\.\.\..*\n/g, "");
    assert.equal(Array.from(withoutMarker).some((c) => c === "\uD83D" || c === "\uDE00"), false);
  });
});
