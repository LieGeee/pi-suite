import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export interface CodeGraphCommandSpec {
  command: string;
  argsPrefix: string[];
  source: "env" | "path" | "npx";
}

export interface RunCodeGraphOptions {
  cwd: string;
  args: string[];
  allowNpx?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

export interface RunCodeGraphResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  commandSource: CodeGraphCommandSpec["source"];
}

export function normalizeCwd(cwd: string | undefined, fallback: string): string {
  return resolve(cwd?.trim() || fallback);
}

export function hasCodeGraphIndex(cwd: string): boolean {
  return existsSync(join(cwd, ".codegraph"));
}

export function resolveCodeGraphCommand(allowNpx = false, env: NodeJS.ProcessEnv = process.env): CodeGraphCommandSpec {
  const configured = env.CODEGRAPH_COMMAND?.trim();
  if (configured) return { command: configured, argsPrefix: [], source: "env" };
  if (allowNpx || env.CODEGRAPH_ALLOW_NPX === "true") {
    return {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      argsPrefix: ["-y", "@colbymchenry/codegraph"],
      source: "npx",
    };
  }
  return { command: process.platform === "win32" ? "codegraph.cmd" : "codegraph", argsPrefix: [], source: "path" };
}

export async function runCodeGraph(options: RunCodeGraphOptions): Promise<RunCodeGraphResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 50_000;
  const spec = resolveCodeGraphCommand(options.allowNpx);
  const args = [...spec.argsPrefix, ...options.args];

  return await new Promise<RunCodeGraphResult>((resolveRun) => {
    let child: ReturnType<typeof spawn>;
    try {
      const invocation = getSpawnInvocation(spec.command, args);
      child = spawn(invocation.command, invocation.args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolveRun({
        command: spec.command,
        args,
        cwd: options.cwd,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: false,
        truncated: false,
        commandSource: spec.source,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let truncated = false;

    const append = (current: string, chunk: Buffer): string => {
      let next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxOutputBytes) {
        truncated = true;
        next = next.slice(0, maxOutputBytes) + "\n[TRUNCATED]";
      }
      return next;
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2_000).unref();
    }, timeoutMs);
    timer.unref();

    const abort = () => {
      child.kill("SIGTERM");
    };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (data) => {
      stdout = append(stdout, data);
    });
    child.stderr.on("data", (data) => {
      stderr = append(stderr, data);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        command: spec.command,
        args,
        cwd: options.cwd,
        exitCode: null,
        stdout,
        stderr: stderr || error.message,
        timedOut,
        truncated,
        commandSource: spec.source,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({
        command: spec.command,
        args,
        cwd: options.cwd,
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        truncated,
        commandSource: spec.source,
      });
    });
  });
}

function getSpawnInvocation(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32") return { command, args };
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(" ")],
  };
}

function quoteWindowsArg(value: string): string {
  if (!/[\s"&()<>^|]/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function formatMissingCodeGraphMessage(cwd: string): string {
  return [
    "CodeGraph CLI was not found on PATH.",
    "",
    "Install globally:",
    "npm install -g @colbymchenry/codegraph",
    "",
    "Or allow one-shot npx for a tool call:",
    "- set tool parameter allowNpx=true, or",
    "- set CODEGRAPH_ALLOW_NPX=true",
    "",
    "After installing, initialize this project if needed:",
    `cd ${cwd}`,
    "codegraph init -i",
    "codegraph index",
  ].join("\n");
}

export function formatNotInitializedMessage(cwd: string): string {
  return [
    `CodeGraph is not initialized for this project: ${cwd}`,
    "",
    "Run explicitly if you want a code knowledge graph here:",
    "codegraph init -i",
    "codegraph index",
    "",
    "The pi CodeGraph extension does not auto-initialize projects.",
  ].join("\n");
}
