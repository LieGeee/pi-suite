import assert from "node:assert/strict";
import test from "node:test";
import { parseDiffForRenderer } from "./diff-inline";

test("parseDiffForRenderer limits rendered lines", () => {
  const diff = Array.from({ length: 20 }, (_, index) => `+line ${index}`).join("\n");
  const lines = parseDiffForRenderer(diff, 5);
  assert.equal(lines.length, 6);
  assert.equal(lines.at(-1)?.type, "header");
  assert.match(lines.at(-1)?.content ?? "", /diff 过长/);
});
