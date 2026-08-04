import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

export interface SubagentModelSelection {
  provider?: string;
  model?: string;
  thinking?: string;
}

export interface SubagentPiInvocation {
  command: string;
  args: string[];
}

export interface SubagentPiInvocationOptions {
  agentDir?: string;
  currentScript?: string;
  executablePath?: string;
  isElectron?: boolean;
  nodeExecutable?: string;
  pathExists?: (path: string) => boolean;
}

export function buildSubagentBaseArgs(selection: SubagentModelSelection, effectiveTools: string[]): string[] {
  const args: string[] = [
    "--mode", "json", "-p", "--no-session",
    "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes",
  ];
  if (selection.provider) args.push("--provider", selection.provider);
  if (selection.model) args.push("--model", selection.model);
  if (selection.thinking) args.push("--thinking", selection.thinking);
  args.push("--tools", effectiveTools.join(","));
  return args;
}

export function resolveSubagentPiInvocation(
  args: readonly string[],
  options: SubagentPiInvocationOptions = {},
): SubagentPiInvocation {
  const executablePath = options.executablePath ?? process.execPath;
  const currentScript = options.currentScript ?? process.argv[1];
  const isElectron = options.isElectron ?? Boolean(process.versions.electron);
  const pathExists = options.pathExists ?? existsSync;
  const siblingCliPath = options.agentDir
    ? resolve(
        options.agentDir,
        "..",
        "runtime",
        "node_modules",
        "@mariozechner",
        "pi-coding-agent",
        "dist",
        "cli.js",
      )
    : undefined;

  if (isElectron) {
    if (!options.agentDir) {
      throw new Error("Subagent cannot start from Electron because no Pi agent directory is configured.");
    }
    if (!siblingCliPath || !pathExists(siblingCliPath)) {
      throw new Error(
        `Subagent cannot start from Electron because the terminal Pi CLI was not found at ${siblingCliPath}.`,
      );
    }

    return {
      command: options.nodeExecutable ?? "node",
      args: [siblingCliPath, ...args],
    };
  }

  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  const isPiCliScript =
    typeof currentScript === "string"
    && /[\\/]pi-coding-agent[\\/]dist[\\/]cli\.js$/i.test(currentScript.replace(/\\/g, "/"));
  // Only reuse the host script when it is provably the Pi CLI; an arbitrary Node
  // runner (SDK host, test runner, tool script) must not be re-invoked with
  // subagent flags.
  if (currentScript && !isBunVirtualScript && isPiCliScript && existsSync(currentScript)) {
    return { command: executablePath, args: [currentScript, ...args] };
  }

  const execName = basename(executablePath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: executablePath, args: [...args] };
  }

  if (siblingCliPath && pathExists(siblingCliPath)) {
    const nodeCommand = options.nodeExecutable ?? (execName.startsWith("node") ? executablePath : "node");
    return { command: nodeCommand, args: [siblingCliPath, ...args] };
  }

  return { command: "pi", args: [...args] };
}
