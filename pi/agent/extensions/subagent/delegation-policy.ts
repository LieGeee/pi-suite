import type { SubagentPermission } from "./permissions.js";

export type SubagentDelegationMode = "single" | "parallel" | "chain";

export interface SubagentDelegationPolicyInput {
  mode: SubagentDelegationMode;
  taskCount: number;
  permissions: SubagentPermission[];
  explicitUserRequest?: boolean;
}

export type SubagentDelegationPolicyResult = { ok: true } | { ok: false; reason: string };

export function validateDelegationPolicy(
  input: SubagentDelegationPolicyInput,
): SubagentDelegationPolicyResult {
  if (input.explicitUserRequest) return { ok: true };

  if (input.mode !== "parallel") {
    return {
      ok: false,
      reason: "Single and chain subagent delegation require an explicit user request.",
    };
  }

  if (input.taskCount < 2) {
    return {
      ok: false,
      reason: "Automatic subagent delegation requires at least two independent parallel tasks.",
    };
  }

  if (input.permissions.some((permission) => permission !== "read")) {
    return {
      ok: false,
      reason: "Automatic subagent delegation is limited to read-only tasks.",
    };
  }

  return { ok: true };
}
