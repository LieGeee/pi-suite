import assert from "node:assert/strict";
import test from "node:test";

import { buildAugmentedPath, resolveWindowsNpmPathCandidates } from "./npm-env";

test("adds Windows npm and Node.js candidates when PATH is minimal", () => {
  const candidates = resolveWindowsNpmPathCandidates({
    APPDATA: "C:/Users/test/AppData/Roaming",
    ProgramFiles: "C:/Program Files",
    USERPROFILE: "C:/Users/test",
  });

  assert.ok(candidates.some((entry) => entry.endsWith("AppData\\Roaming\\npm")));
  assert.ok(candidates.some((entry) => entry.endsWith("Program Files\\nodejs")));
});

test("buildAugmentedPath prepends existing candidates without duplicating current PATH entries", () => {
  const currentPath = "C:/Windows/System32;C:/Program Files/nodejs";
  const nextPath = buildAugmentedPath(currentPath, [
    "C:/Users/test/AppData/Roaming/npm",
    "C:/Program Files/nodejs",
  ], (candidate) => candidate.includes("Roaming"));

  assert.equal(nextPath.replace(/\\/g, "/"), "C:/Users/test/AppData/Roaming/npm;C:/Windows/System32;C:/Program Files/nodejs");
});
