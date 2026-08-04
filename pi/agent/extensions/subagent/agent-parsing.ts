/**
 * Pure agent-frontmatter normalization used by agent discovery.
 *
 * Kept free of Pi runtime imports so it can be unit-tested in isolation.
 */
export interface NormalizedAgentMeta {
  name?: string;
  description?: string;
  tools?: string[];
  provider?: string;
  model?: string;
  thinking?: string;
}

/**
 * Normalize parsed frontmatter into an AgentConfig-shaped meta object.
 * Handles `tools` declared either as a comma string or a YAML list and
 * coerces scalar fields defensively.
 */
export function normalizeAgentFrontmatter(frontmatter: Record<string, unknown>): NormalizedAgentMeta {
  const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
  const description = typeof frontmatter.description === "string" ? frontmatter.description : undefined;

  const rawTools = frontmatter.tools;
  const tools = Array.isArray(rawTools)
    ? rawTools.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
    : typeof rawTools === "string"
      ? rawTools.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;

  return {
    name,
    description,
    tools: tools && tools.length > 0 ? tools : undefined,
    provider: typeof frontmatter.provider === "string" ? frontmatter.provider : undefined,
    model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
    thinking: typeof frontmatter.thinking === "string" ? frontmatter.thinking : undefined,
  };
}
