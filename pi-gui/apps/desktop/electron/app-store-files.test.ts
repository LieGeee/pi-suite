import assert from "node:assert/strict";
import test from "node:test";
import { limitWorkspaceFilesForRenderer } from "./app-store-files";

test("limitWorkspaceFilesForRenderer sorts and caps file lists", () => {
  const files = ["z.ts", "a.ts", "m.ts", "b.ts"];
  assert.deepEqual(limitWorkspaceFilesForRenderer(files, 3), ["a.ts", "b.ts", "m.ts"]);
});

test("limitWorkspaceFilesForRenderer drops blank entries", () => {
  assert.deepEqual(limitWorkspaceFilesForRenderer(["", " a.ts ", "  "], 10), ["a.ts"]);
});
