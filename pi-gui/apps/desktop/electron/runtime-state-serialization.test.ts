import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeCommandRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import { serializeRuntimeSnapshotForRenderer, serializeSessionCommandsForRenderer } from "./runtime-state-serialization";

function command(overrides: Partial<RuntimeCommandRecord> = {}): RuntimeCommandRecord {
  return {
    name: overrides.name ?? "huge",
    description: overrides.description ?? "d".repeat(10_000),
    source: overrides.source ?? "extension",
    sourceInfo: overrides.sourceInfo ?? {
      path: "S:/repo/extension.json",
      source: "extension:huge",
      scope: "project",
      origin: "top-level",
      baseDir: "S:/repo",
    },
  };
}

function runtimeSnapshot(): RuntimeSnapshot {
  return {
    workspace: { workspaceId: "w", path: "S:/repo" },
    providers: [],
    models: [],
    skills: [
      {
        name: "huge-skill",
        description: "s".repeat(10_000),
        filePath: "S:/repo/.pi/skills/huge/SKILL.md",
        baseDir: "S:/repo/.pi/skills/huge",
        source: "project",
        enabled: true,
        disableModelInvocation: false,
        slashCommand: "/skill:huge-skill",
      },
    ],
    extensions: [
      {
        path: "S:/repo/ext.json",
        displayName: "Huge extension",
        description: "e".repeat(10_000),
        enabled: true,
        sourceInfo: {
          path: "S:/repo/ext.json",
          source: "extension:huge",
          scope: "project",
          origin: "top-level",
        },
        commands: [],
        tools: [],
        flags: [],
        shortcuts: [],
        diagnostics: [{ type: "warning", message: "d".repeat(10_000), path: "S:/repo/ext.json" }],
      },
    ],
    settings: { enableSkillCommands: true, enabledModelPatterns: [] },
  };
}

test("serializeSessionCommandsForRenderer bounds display text while preserving command identity", () => {
  const serializedCommands = serializeSessionCommandsForRenderer([command()]) ?? [];
  const serialized = serializedCommands[0];

  assert.equal(serialized?.name, "huge");
  assert.equal(serialized?.sourceInfo.path, "S:/repo/extension.json");
  assert.ok((serialized?.description?.length ?? 0) < 10_000);
  assert.match(serialized?.description ?? "", /已截断/);
});

test("serializeRuntimeSnapshotForRenderer bounds skill and extension display text", () => {
  const serialized = serializeRuntimeSnapshotForRenderer(runtimeSnapshot());

  assert.equal(serialized.skills[0]?.filePath, "S:/repo/.pi/skills/huge/SKILL.md");
  assert.equal(serialized.extensions[0]?.path, "S:/repo/ext.json");
  assert.ok(serialized.skills[0]!.description.length < 10_000);
  assert.ok((serialized.extensions[0]!.description?.length ?? 0) < 10_000);
  assert.ok(serialized.extensions[0]!.diagnostics[0]!.message.length < 10_000);
  assert.match(serialized.skills[0]!.description, /已截断/);
  assert.match(serialized.extensions[0]!.description ?? "", /已截断/);
  assert.match(serialized.extensions[0]!.diagnostics[0]!.message, /已截断/);
});
