import assert from "node:assert/strict";
import test from "node:test";
import { limitDiffForRenderer } from "./app-store-diff";

test("limitDiffForRenderer leaves small diffs unchanged", () => {
  assert.equal(limitDiffForRenderer("small", 10), "small");
});

test("limitDiffForRenderer truncates large diffs with a visible marker", () => {
  const diff = "x".repeat(100);
  const limited = limitDiffForRenderer(diff, 20);
  assert.ok(limited.length < diff.length);
  assert.match(limited, /diff 过大/);
  assert.match(limited, /完整内容仍保留/);
});
