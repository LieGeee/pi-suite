export type ProjectApprovalDecision =
  | { action: "confirm" }
  | { action: "deny"; reason: string }
  | { action: "allow" };

/**
 * Decide whether running requested project-local agents is permitted.
 * - UI available and confirmation enabled: prompt the user.
 * - No UI and no explicit user request: deny (headless cannot confirm).
 * - Otherwise allow (explicit user request, or confirmation disabled in UI).
 */
export function decideProjectAgentApproval(options: {
  projectAgentsRequested: boolean;
  hasUI: boolean;
  confirmProjectAgents: boolean;
  explicitUserRequest: boolean;
}): ProjectApprovalDecision | undefined {
  if (!options.projectAgentsRequested) return undefined;
  if (!options.hasUI && !options.explicitUserRequest) {
    return {
      action: "deny",
      reason: "Project-local agents require an explicit user request when running without a UI.",
    };
  }
  if (options.hasUI && options.confirmProjectAgents) return { action: "confirm" };
  return { action: "allow" };
}
