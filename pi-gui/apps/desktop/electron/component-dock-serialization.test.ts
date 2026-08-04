import assert from "node:assert/strict";
import test from "node:test";
import type { DockComponentDefinition } from "../src/desktop-state";
import { sanitizeDockComponentDefinitionForState } from "./component-dock-serialization";

function component(): DockComponentDefinition {
  return {
    id: "huge",
    label: "Huge",
    icon: "H",
    kind: "custom",
    source: "user",
    description: "d".repeat(10_000),
    configJson: "j".repeat(100_000),
  };
}

test("sanitizeDockComponentDefinitionForState bounds description and configJson", () => {
  const sanitized = sanitizeDockComponentDefinitionForState(component());

  assert.equal(sanitized.id, "huge");
  assert.ok(sanitized.description.length < 10_000);
  assert.ok((sanitized.configJson?.length ?? 0) < 100_000);
  assert.match(sanitized.description, /已截断/);
  assert.match(sanitized.configJson ?? "", /已截断/);
});
