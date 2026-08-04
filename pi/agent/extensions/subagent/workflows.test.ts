import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  getBuiltinSubagentWorkflows,
  getWorkflowExecutionBatches,
  listSubagentWorkflows,
  parseSubagentWorkflowCommandArgs,
  renderWorkflowTemplate,
  validateSubagentWorkflow,
} from "./workflows.js";

describe("subagent workflows", () => {
  it("provides built-in Dify-like workflows", () => {
    const workflows = getBuiltinSubagentWorkflows();
    assert.deepEqual(workflows.map((workflow) => workflow.id), [
      "quick-scout",
      "scout-plan",
      "implement",
      "implement-review",
      "parallel-scout",
    ]);
    assert.deepEqual(
      workflows.map((workflow) => [workflow.id, workflow.enabled]),
      [
        ["quick-scout", true],
        ["scout-plan", false],
        ["implement", false],
        ["implement-review", false],
        ["parallel-scout", true],
      ],
    );
    assert.equal(validateSubagentWorkflow(workflows[0]).ok, true);
  });

  it("groups independent parallel-scout nodes into one dependency batch", () => {
    const workflow = getBuiltinSubagentWorkflows().find((candidate) => candidate.id === "parallel-scout");
    assert.ok(workflow);
    assert.deepEqual(
      getWorkflowExecutionBatches(workflow).map((batch) => batch.map((node) => node.id)),
      [
        ["start"],
        ["scout-code", "scout-tests", "scout-docs"],
        ["aggregator"],
        ["end"],
      ],
    );
  });

  it("rejects workflow node types that the runtime does not implement", () => {
    const workflow = structuredClone(getBuiltinSubagentWorkflows()[0]);
    workflow.nodes[1].type = "http";
    const validation = validateSubagentWorkflow(workflow);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /not supported/i);
  });

  it("rejects disconnected nodes not reachable from start or end", () => {
    const workflow = structuredClone(getBuiltinSubagentWorkflows()[0]);
    workflow.nodes.push({ id: "orphan", type: "subagent", agent: "worker", task: "run", permission: "write" });
    const validation = validateSubagentWorkflow(workflow);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /not reachable from start/);
    assert.match(validation.errors.join(" "), /cannot reach the end/);
  });

  it("rejects conditional edges because the runtime does not implement them", () => {
    const workflow = structuredClone(getBuiltinSubagentWorkflows()[0]);
    workflow.edges[0].condition = "always";
    const validation = validateSubagentWorkflow(workflow);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /condition/);
  });

  it("rejects workflows with a start node that has incoming edges", () => {
    const workflow = structuredClone(getBuiltinSubagentWorkflows()[0]);
    workflow.edges.push({ from: "scout", to: "start" });
    const validation = validateSubagentWorkflow(workflow);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /Start node must not have incoming edges/);
  });

  it("validates structure defensively instead of throwing on missing nodes", () => {
    const validation = validateSubagentWorkflow({ id: "x", name: "x", version: 1 } as never);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /non-empty array/);
  });

  it("rejects cyclic workflow execution graphs", () => {
    // A mid-graph cycle that does not touch start/end must be detected as a cycle.
    const workflow = structuredClone(getBuiltinSubagentWorkflows().find((candidate) => candidate.id === "quick-scout")!);
    workflow.nodes.push({ id: "loop-a", type: "subagent", agent: "scout", task: "a" });
    workflow.nodes.push({ id: "loop-b", type: "subagent", agent: "scout", task: "b" });
    workflow.edges.push({ from: "scout", to: "loop-a" });
    workflow.edges.push({ from: "loop-a", to: "loop-b" });
    workflow.edges.push({ from: "loop-b", to: "loop-a" });
    assert.throws(() => getWorkflowExecutionBatches(workflow), /cycle/i);
    // Validation rejects the same graph; the exact message may be a cycle or a reachability error.
    const validation = validateSubagentWorkflow(workflow);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join(" "), /cycle|cannot reach|not reachable/i);
  });

  it("overlays user workflow JSON files from the Pi config dir", async () => {
    const piConfigDir = mkdtempSync(join(tmpdir(), "pi-subagent-workflows-"));
    const workflowDir = join(piConfigDir, "subagent-workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(join(workflowDir, "quick-scout.json"), JSON.stringify({
      ...getBuiltinSubagentWorkflows()[0],
      name: "User Quick Scout",
      enabled: false,
    }), "utf8");

    const workflows = await listSubagentWorkflows(piConfigDir);
    assert.equal(workflows.workflows.find((workflow) => workflow.id === "quick-scout")?.name, "User Quick Scout");
    assert.equal(workflows.workflows.find((workflow) => workflow.id === "quick-scout")?.source, "user");
  });

  it("skips a broken user workflow file without breaking other workflows", async () => {
    const piConfigDir = mkdtempSync(join(tmpdir(), "pi-subagent-workflows-"));
    const workflowDir = join(piConfigDir, "subagent-workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(join(workflowDir, "broken.json"), "{ not valid json", "utf8");
    await writeFile(
      join(workflowDir, "invalid-structure.json"),
      JSON.stringify({ id: "bad", name: "Bad", version: 1 }),
      "utf8",
    );

    const result = await listSubagentWorkflows(piConfigDir);
    assert.equal(result.workflows.some((workflow) => workflow.id === "quick-scout"), true);
    assert.equal(result.workflows.some((workflow) => workflow.id === "broken"), false);
    assert.equal(result.workflows.some((workflow) => workflow.id === "bad"), false);
    assert.equal(result.diagnostics.length, 2);
  });

  it("parses workflow command args", () => {
    assert.deepEqual(parseSubagentWorkflowCommandArgs("implement-review fix login bug"), {
      workflowId: "implement-review",
      task: "fix login bug",
    });
    assert.deepEqual(parseSubagentWorkflowCommandArgs("--workflow scout-plan plan auth"), {
      workflowId: "scout-plan",
      task: "plan auth",
    });
    assert.match(parseSubagentWorkflowCommandArgs("").error ?? "", /Usage/);
  });

  it("renders templates with input and node outputs", () => {
    assert.equal(
      renderWorkflowTemplate("Fix {{input.task}} after {{scout.output}}", {
        "input.task": "login",
        "scout.output": "auth context",
      }),
      "Fix login after auth context",
    );
  });
});
