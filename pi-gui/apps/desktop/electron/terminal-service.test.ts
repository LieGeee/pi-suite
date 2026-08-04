import assert from "node:assert/strict";
import test from "node:test";
import { chunkTerminalDataForRenderer } from "./terminal-service";

test("chunkTerminalDataForRenderer leaves small chunks unchanged", () => {
  assert.deepEqual(chunkTerminalDataForRenderer("abc", 10), ["abc"]);
});

test("chunkTerminalDataForRenderer splits oversized chunks", () => {
  const chunks = chunkTerminalDataForRenderer("x".repeat(25), 10);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [10, 10, 5]);
  assert.equal(chunks.join(""), "x".repeat(25));
});

test("chunkTerminalDataForRenderer drops empty input", () => {
  assert.deepEqual(chunkTerminalDataForRenderer("", 10), []);
});
