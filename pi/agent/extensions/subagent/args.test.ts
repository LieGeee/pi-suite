import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitCommandArgs } from "./args.js";

describe("subagent command arg splitting", () => {
  it("keeps Windows backslash paths intact", () => {
    assert.deepEqual(splitCommandArgs('--cwd C:\\Users\\leizh\\repo scout task'), [
      "--cwd",
      "C:\\Users\\leizh\\repo",
      "scout",
      "task",
    ]);
  });

  it("keeps backslashes inside double quotes", () => {
    assert.deepEqual(splitCommandArgs('--cwd "C:\\Users\\leizh\\repo" scout task'), [
      "--cwd",
      "C:\\Users\\leizh\\repo",
      "scout",
      "task",
    ]);
  });

  it("supports escaped quotes and spaces", () => {
    assert.deepEqual(splitCommandArgs('agent "say \\"hi\\""'), ["agent", 'say "hi"']);
    assert.deepEqual(splitCommandArgs('agent say\\ hi'), ["agent", "say hi"]);
  });

  it("treats single quotes as literal grouping", () => {
    assert.deepEqual(splitCommandArgs("agent 'C:\\raw\\path' rest"), ["agent", "C:\\raw\\path", "rest"]);
  });

  it("keeps a trailing backslash literally", () => {
    assert.deepEqual(splitCommandArgs("agent C:\\"), ["agent", "C:\\"]);
  });

  it("handles escaped backslash and empty input", () => {
    assert.deepEqual(splitCommandArgs("a\\\\b c"), ["a\\b", "c"]);
    assert.deepEqual(splitCommandArgs("   "), []);
  });
});
