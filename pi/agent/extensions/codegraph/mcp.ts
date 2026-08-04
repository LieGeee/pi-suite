import { spawn } from "node:child_process";

export interface CodeGraphMcpCallOptions {
  cwd: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

export interface CodeGraphMcpCallResult {
  cwd: string;
  toolName: string;
  arguments: Record<string, unknown>;
  stdoutMessages: unknown[];
  stderr: string;
  text: string;
  timedOut: boolean;
  truncated: boolean;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export async function callCodeGraphMcpTool(options: CodeGraphMcpCallOptions): Promise<CodeGraphMcpCallResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 80_000;
  const invocation = getCodeGraphMcpInvocation();
  const child = spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  const stdoutMessages: unknown[] = [];
  let stdoutBuffer = "";
  let stderr = "";
  let timedOut = false;
  let truncated = false;
  let settled = false;

  const appendStderrLimited = (current: string, chunk: string): string => {
    let next = current + chunk;
    if (Buffer.byteLength(next, "utf8") > maxOutputBytes) {
      truncated = true;
      next = next.slice(0, maxOutputBytes) + "\n[TRUNCATED]";
    }
    return next;
  };

  const timer = setTimeout(() => {
    timedOut = true;
    rejectAll(new Error(`CodeGraph MCP call timed out after ${timeoutMs}ms`));
    child.kill("SIGTERM");
  }, timeoutMs);
  timer.unref();

  const abort = () => {
    rejectAll(new Error("CodeGraph MCP call was aborted"));
    child.kill("SIGTERM");
  };
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });

  child.stdout.on("data", (data) => {
    stdoutBuffer += data.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      stdoutMessages.push(message);
      if (typeof message.id === "number" && pending.has(message.id)) {
        const request = pending.get(message.id)!;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
    }
  });

  child.stderr.on("data", (data) => {
    stderr = appendStderrLimited(stderr, data.toString("utf8"));
  });

  child.on("error", (error) => {
    rejectAll(error instanceof Error ? error : new Error(String(error)));
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    if (!settled && pending.size > 0) {
      rejectAll(new Error(`CodeGraph MCP server exited before response, code=${code}, stderr=${stderr.trim()}`));
    }
  });

  try {
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pi-codegraph-extension", version: "0.1.0" },
    });
    notify("notifications/initialized", {});
    const result = await request("tools/call", {
      name: options.toolName,
      arguments: options.arguments,
    });
    settled = true;
    clearTimeout(timer);
    child.kill("SIGTERM");
    return {
      cwd: options.cwd,
      toolName: options.toolName,
      arguments: options.arguments,
      stdoutMessages,
      stderr,
      text: truncateText(extractMcpText(result), maxOutputBytes, (value) => {
        truncated = value;
      }),
      timedOut,
      truncated,
    };
  } catch (error) {
    settled = true;
    clearTimeout(timer);
    child.kill("SIGTERM");
    throw error;
  }

  function request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  function notify(method: string, params: Record<string, unknown>): void {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  function rejectAll(error: Error): void {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
}

function truncateText(text: string, maxBytes: number, setTruncated: (value: boolean) => void): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  setTruncated(true);
  return `${text.slice(0, maxBytes)}\n[TRUNCATED]`;
}

function extractMcpText(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
          return String((part as { text?: unknown }).text ?? "");
        }
        return JSON.stringify(part);
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return JSON.stringify(result, null, 2);
}

function getCodeGraphMcpInvocation(): { command: string; args: string[] } {
  if (process.platform !== "win32") return { command: "codegraph", args: ["serve", "--mcp"] };
  return { command: "cmd.exe", args: ["/d", "/s", "/c", "codegraph.cmd serve --mcp"] };
}
