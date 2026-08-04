import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAgentFrontmatter } from "./agent-parsing.js";

describe("subagent agent frontmatter normalization", () => {
  it("parses tools declared as a YAML list", () => {
    assert.deepEqual(
      normalizeAgentFrontmatter({
        name: "listy",
        description: "listy agent",
        tools: ["read", "grep"],
        provider: "p",
        model: "m",
      }),
      {
        name: "listy",
        description: "listy agent",
        tools: ["read", "grep"],
        provider: "p",
        model: "m",
        thinking: undefined,
      },
    );
  });

  it("parses tools declared as a comma string", () => {
    assert.deepEqual(normalizeAgentFrontmatter({ tools: "read, grep, " }).tools, ["read", "grep"]);
  });

  it("drops non-string tools and invalid scalars", () => {
    assert.deepEqual(normalizeAgentFrontmatter({ tools: ["read", 7, null, "grep"] }).tools, ["read", "grep"]);
    assert.equal(normalizeAgentFrontmatter({ name: 42 }).name, undefined);
    assert.equal(normalizeAgentFrontmatter({ provider: ["x"] }).provider, undefined);
  });

  it("normalizes list/string/undefined tools consistently", () => {
    assert.equal(normalizeAgentFrontmatter({}).tools, undefined);
    assert.deepEqual(normalizeAgentFrontmatter({ tools: "a,b" }).tools, ["a", "b"]);
    assert.deepEqual(normalizeAgentFrontmatter({ tools: ["a", "b"] }).tools, ["a", "b"]);
  });
});
