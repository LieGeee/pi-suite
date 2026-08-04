import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "typebox";

const DEFAULT_GUI_DATA_DIR = "S:/tool/pi/gui-data";

export default function cliExtension(pi: Parameters<typeof registerCliExtension>[0]) {
  registerCliExtension(pi, Type);
}

export function registerCliExtension(pi, Type) {
  pi.registerCommand("cli", {
    description: "Manage and execute configured CLI tools (MySQL, PostgreSQL, Redis, etc.)",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed || trimmed === "help") {
        ctx.ui.notify("用法: /cli list | /cli run <工具名> <命令>", "info");
        return;
      }

      if (trimmed === "list") {
        await listTools(ctx);
        return;
      }

      if (trimmed.startsWith("run ")) {
        const rest = trimmed.slice(4).trim();
        const firstSpace = rest.search(/\s/);
        const toolName = firstSpace === -1 ? rest : rest.slice(0, firstSpace);
        const toolArgs = firstSpace === -1 ? "" : rest.slice(firstSpace + 1).trim();
        try {
          const config = await loadCliConfig();
          const tool = config?.find((t) => t.name.toLowerCase() === toolName.toLowerCase());
          if (!tool) {
            ctx.ui.notify(`CLI 工具 "${toolName}" 未找到。使用 /cli list 查看已配置的工具。`, "warning");
            return;
          }
          await runTool(tool, toolArgs, ctx);
        } catch (error) {
          ctx.ui.notify(`错误: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
        return;
      }

      ctx.ui.notify("未知子命令。用法: /cli list | /cli run <工具名> <命令>", "warning");
    },
  });

  pi.registerTool({
    name: "cli_execute",
    label: "Execute CLI Tool",
    description: "Execute a configured CLI tool (MySQL, PostgreSQL, Redis, etc.) with the active connection and return the output.",
    promptSnippet: "Run a configured CLI tool command",
    promptGuidelines: ["Use cli_execute to run commands through tools configured in the Extensions view."],
    parameters: Type.Object({
      tool: Type.String({ description: "Name of the configured CLI tool (e.g., MySQL)" }),
      command: Type.String({ description: "Command arguments to pass to the CLI tool" }),
      connection: Type.Optional(Type.String({ description: "Optional connection name. Uses active connection by default." })),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const config = await loadCliConfig();
        const tool = config?.find((t) => t.name.toLowerCase() === params.tool.toLowerCase());
        if (!tool) {
          return {
            content: [{ type: "text", text: `CLI 工具 "${params.tool}" 未找到。请先在扩展页面配置。` }],
            details: { error: "Tool not found" },
            isError: true,
          };
        }
        const connectionName = params.connection || tool.activeConnection;
        const connection = connectionName ? tool.connections.find((c) => c.name === connectionName) : undefined;
        if (!connection && tool.connections.length > 0) {
          return {
            content: [{ type: "text", text: `连接 "${connectionName}" 未找到。请先在扩展页面配置。` }],
            details: { error: "Connection not found" },
            isError: true,
          };
        }
        const result = await executeCli(tool, connection ?? null, params.command, signal);
        return {
          content: [{ type: "text", text: result.output }],
          details: { exitCode: result.exitCode, tool: tool.name, connection: connection.name },
          isError: result.exitCode !== 0,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `CLI 执行失败: ${error instanceof Error ? error.message : String(error)}` }],
          details: { error: error instanceof Error ? error.message : String(error) },
          isError: true,
        };
      }
    },
  });
}

async function listTools(ctx) {
  try {
    const config = await loadCliConfig();
    if (!config || config.length === 0) {
      ctx.ui.notify("没有已配置的 CLI 工具。请先在 pi-gui 扩展页面的「CLI 工具管理」中添加。", "info");
      return;
    }
    const lines = config.map((tool) => {
      const connInfo = tool.connections.map((c) =>
        `${c.name} (${c.host}:${c.port})${c.name === tool.activeConnection ? " ✅" : ""}`
      ).join(", ");
      return `  ${tool.name}: ${tool.command}\n    ${connInfo}`;
    });
    ctx.ui.notify(`已配置的 CLI 工具:\n${lines.join("\n")}`, "info");
  } catch (error) {
    ctx.ui.notify(`读取配置失败: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function runTool(tool, args, ctx) {
  const connectionName = tool.activeConnection;
  const connection = tool.connections.find((c) => c.name === connectionName) || tool.connections[0];
  if (!connection && args) {
    // No connections but has args — run directly (e.g. OfficeCLI)
    ctx.ui.notify(`正在执行 ${tool.name}...`, "info");
    try {
      const result = await executeCli(tool, null, args, ctx.signal);
      ctx.ui.notify(`执行完成（退出码 ${result.exitCode}）`, result.exitCode === 0 ? "success" : "error");
      pi.sendMessage({
        customType: "cli-execution",
        content: result.output,
        display: true,
        details: { tool: tool.name, exitCode: result.exitCode },
      });
    } catch (error) {
      ctx.ui.notify(`执行失败: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
    return;
  }
  if (!connection) {
    ctx.ui.notify("该工具没有可用连接。请在扩展页面添加连接。", "warning");
    return;
  }
  ctx.ui.notify(`正在执行 ${tool.name} → ${connection.name}...`, "info");
  try {
    const result = await executeCli(tool, connection, args, ctx.signal);
    ctx.ui.notify(`执行完成（退出码 ${result.exitCode}）`, result.exitCode === 0 ? "success" : "error");
    pi.sendMessage({
      customType: "cli-execution",
      content: result.output,
      display: true,
      details: { tool: tool.name, connection: connection.name, exitCode: result.exitCode },
    });
  } catch (error) {
    ctx.ui.notify(`执行失败: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function executeCli(tool, connection, args, signal) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...(connection ? { MYSQL_PWD: connection.password || "", PGPASSWORD: connection.password || "" } : {}),
    };

    const childArgs = [];
    if (!connection) {
      // No connection — pass args directly (e.g. OfficeCLI)
      childArgs.push(...args.split(/\s+/).filter(Boolean));
    } else if (tool.name.toLowerCase().includes("mysql")) {
      // Build standard connection args
      childArgs.push(
        ...(tool.argsTemplate || []).map((t) =>
          t.replace("{host}", connection.host)
           .replace("{port}", String(connection.port))
           .replace("{user}", connection.user)
           .replace("{password}", connection.password)
           .replace("{database}", connection.database || "")
        ),
        ...args.split(/\s+/).filter(Boolean),
      );
    } else {
      // Generic tool with connection
      childArgs.push(...args.split(/\s+/).filter(Boolean));
    }

    const child = spawn(tool.command, childArgs, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after 60s`));
    }, 60_000);
    timeout.unref();

    if (signal?.aborted) {
      child.kill("SIGTERM");
      reject(new Error("Aborted"));
      return;
    }
    signal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      reject(new Error("Aborted"));
    }, { once: true });

    child.stdout.on("data", (data) => { stdout += data.toString("utf8"); });
    child.stderr.on("data", (data) => { stderr += data.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const output = (stdout || stderr || "(no output)").trim();
      resolve({ output, exitCode: code ?? -1 });
    });
  });
}

async function loadCliConfig() {
  const guiStatePath = process.env.DIFY_GUI_STATE_PATH ?? join(process.env.PI_GUI_DATA_DIR ?? DEFAULT_GUI_DATA_DIR, "ui-state.json");
  try {
    const state = JSON.parse(await readFile(guiStatePath, "utf8"));
    return state?.cliTools ?? [];
  } catch {
    return [];
  }
}
