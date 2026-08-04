import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoopContinuationPrompt,
  createLoopState,
  parseLoopArgs,
  shouldContinueLoop,
} from "./state.js";

describe("loop extension state", () => {
  it("parses defaults and a goal", () => {
    assert.deepEqual(parseLoopArgs("fix the flaky tests"), {
      goal: "fix the flaky tests",
      maxTurns: 20,
      delayMs: 2000,
    });
  });

  it("parses safety options", () => {
    assert.deepEqual(parseLoopArgs("--max 3 --delay 500 finish docs"), {
      goal: "finish docs",
      maxTurns: 3,
      delayMs: 500,
    });
  });

  it("rejects empty loop goals", () => {
    assert.match(parseLoopArgs("").error ?? "", /Usage/);
  });

  it("stops when the assistant marks done", () => {
    const state = createLoopState({ goal: "ship it", maxTurns: 20, delayMs: 2000 });
    state.turnsCompleted = 3;
    assert.deepEqual(shouldContinueLoop(state, "all set [LOOP:DONE]"), {
      continue: false,
      reason: "done-marker",
    });
  });

  it("stops at the max turn limit", () => {
    const state = createLoopState({ goal: "ship it", maxTurns: 2, delayMs: 2000 });
    state.turnsCompleted = 2;
    assert.deepEqual(shouldContinueLoop(state, "keep going"), {
      continue: false,
      reason: "max-turns",
    });
  });

  it("builds the follow-up prompt with the loop goal", () => {
    const state = createLoopState({ goal: "finish migration", maxTurns: 5, delayMs: 2000 });
    state.turnsCompleted = 2;
    assert.match(buildLoopContinuationPrompt(state), /Loop goal: finish migration/);
    assert.match(buildLoopContinuationPrompt(state), /Turn 3 of 5/);
    assert.match(buildLoopContinuationPrompt(state), /\[LOOP:DONE\]/);
  });
});
