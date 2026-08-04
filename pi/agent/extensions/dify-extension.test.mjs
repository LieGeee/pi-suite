import assert from "node:assert/strict";
import test from "node:test";

import { parseRunArguments, registerDifyExtension } from "./dify-extension.mjs";

test("parses an optional workflow version and JSON inputs from /dify run", () => {
  assert.deepEqual(
    parseRunArguments('workflow-v2 {"topic":"release notes","language":"zh-CN"}'),
    {
      workflowId: "workflow-v2",
      inputs: { topic: "release notes", language: "zh-CN" },
    },
  );
  assert.deepEqual(parseRunArguments('{"topic":"release notes"}'), {
    workflowId: undefined,
    inputs: { topic: "release notes" },
  });
});

test("registers a Dify command and a callable workflow tool", () => {
  const commands = new Map();
  const tools = new Map();
  const pi = {
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
  };
  const Type = {
    Object: (properties) => ({ properties }),
    Optional: (schema) => ({ optional: schema }),
    String: (options) => ({ type: "string", ...options }),
    Record: (key, value) => ({ key, value }),
    Unknown: () => ({ type: "unknown" }),
  };

  registerDifyExtension(pi, Type);

  assert.equal(commands.get("dify")?.description, "Run the Dify workflow configured in pi-gui");
  assert.equal(tools.get("dify_run_workflow")?.label, "Run Dify Workflow");
  assert.equal(typeof tools.get("dify_run_workflow")?.execute, "function");
});
