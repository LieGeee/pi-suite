export type SubagentPermission = "read" | "exec" | "write";
export type SubagentAgentScope = "user" | "project" | "both";

import { splitCommandArgs } from "./args.js";

const READ_TOOLS = ["read", "grep", "find", "ls"] as const;
const EXEC_TOOLS = [...READ_TOOLS, "bash"] as const;
const WRITE_TOOLS = [...EXEC_TOOLS, "edit", "write"] as const;

export function permissionToTools(permission: SubagentPermission | undefined): string[] {
  switch (permission ?? "read") {
    case "read":
      return [...READ_TOOLS];
    case "exec":
      return [...EXEC_TOOLS];
    case "write":
      return [...WRITE_TOOLS];
  }
}

export function getEffectiveTools(agentTools: string[] | undefined, permission: SubagentPermission | undefined): string[] {
  const allowed = permissionToTools(permission);
  if (!agentTools || agentTools.length === 0) return allowed;
  const allowedSet = new Set(allowed);
  return agentTools.filter((tool) => allowedSet.has(tool));
}

export interface ParsedSubagentCommandArgs {
  agent: string;
  task: string;
  permission: SubagentPermission;
  cwd?: string;
  agentScope: SubagentAgentScope;
}

export type ParseSubagentCommandArgsResult = ParsedSubagentCommandArgs | { error: string };

const USAGE = "Usage: /subagent [--permission read|exec|write | --read|--exec|--write] [--scope user|project|both] [--cwd <dir>] <agent> <task>";

export function parseSubagentCommandArgs(args: string): ParseSubagentCommandArgsResult {
  const tokens = splitCommandArgs(args);
  if (tokens.length === 0) return { error: USAGE };

  let permission: SubagentPermission = "read";
  let agentScope: SubagentAgentScope = "user";
  let cwd: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--read" || token === "--exec" || token === "--write") {
      permission = token.slice(2) as SubagentPermission;
      continue;
    }
    if (token === "--permission" || token === "--perm") {
      const value = tokens[++i];
      if (!isPermission(value)) return { error: `Invalid permission: ${value ?? "(missing)"}. Expected read, exec, or write.\n${USAGE}` };
      permission = value;
      continue;
    }
    if (token === "--scope" || token === "--agent-scope") {
      const value = tokens[++i];
      if (!isAgentScope(value)) return { error: `Invalid scope: ${value ?? "(missing)"}. Expected user, project, or both.\n${USAGE}` };
      agentScope = value;
      continue;
    }
    if (token === "--cwd") {
      const value = tokens[++i];
      if (!value) return { error: `Missing value for --cwd.\n${USAGE}` };
      cwd = value;
      continue;
    }
    positional.push(token);
  }

  if (positional.length < 2) return { error: USAGE };
  const [agent, ...taskParts] = positional;
  return { agent, task: taskParts.join(" "), permission, cwd, agentScope };
}

function isPermission(value: string | undefined): value is SubagentPermission {
  return value === "read" || value === "exec" || value === "write";
}

function isAgentScope(value: string | undefined): value is SubagentAgentScope {
  return value === "user" || value === "project" || value === "both";
}
