import { loadDifyConfig, runDifyWorkflow } from "./dify-client.mjs";

const MAX_RESULT_LENGTH = 12_000;

export function registerDifyExtension(pi, Type) {
  pi.registerCommand("dify", {
    description: "Run the Dify workflow configured in pi-gui",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request || request === "help") {
        ctx.ui.notify("用法: /dify status | /dify run [workflow_id] <JSON 输入>", "info");
        return;
      }

      if (request === "status") {
        await showStatus(ctx);
        return;
      }

      if (!request.startsWith("run")) {
        ctx.ui.notify("未知 Dify 子命令。用法: /dify status | /dify run [workflow_id] <JSON 输入>", "warning");
        return;
      }

      try {
        const { workflowId, inputs } = parseRunArguments(request.slice(3).trim());
        await runAndPublish({ pi, ctx, workflowId, inputs });
      } catch (error) {
        publishFailure(pi, ctx, error);
      }
    },
  });

  pi.registerTool({
    name: "dify_run_workflow",
    label: "Run Dify Workflow",
    description: "Run the Dify Workflow app configured in pi-gui and return its published outputs.",
    promptSnippet: "Run the configured Dify workflow with named input values",
    promptGuidelines: ["Use dify_run_workflow when the user asks to run their configured Dify workflow or needs its published outputs."],
    parameters: Type.Object({
      inputs: Type.Record(Type.String(), Type.Unknown(), {
        description: "The Dify workflow's named input values.",
      }),
      workflow_id: Type.Optional(Type.String({
        description: "Optional published workflow version ID. Omit to run the currently published workflow.",
      })),
      user: Type.Optional(Type.String({
        description: "End-user identifier passed to Dify. Defaults to pi-gui.",
      })),
    }),
    async execute(_toolCallId, params, signal) {
      try {
        const config = await loadDifyConfig();
        const result = await runDifyWorkflow({
          ...config,
          workflowId: params.workflow_id,
          inputs: params.inputs,
          user: params.user,
          signal,
        });
        return {
          content: [{ type: "text", text: formatSuccess(result) }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Dify 工作流执行失败: ${errorMessage(error)}` }],
          details: { error: errorMessage(error) },
          isError: true,
        };
      }
    },
  });
}

export function parseRunArguments(value) {
  if (!value) {
    throw new Error("缺少 JSON 输入。示例: /dify run {\"topic\":\"release notes\"}");
  }

  const firstSpace = value.search(/\s/);
  const startsWithJson = value.startsWith("{");
  const workflowId = startsWithJson ? undefined : value.slice(0, firstSpace === -1 ? value.length : firstSpace);
  const json = startsWithJson ? value : value.slice(firstSpace).trim();
  if (!json) {
    throw new Error("缺少 JSON 输入。示例: /dify run workflow-v2 {\"topic\":\"release notes\"}");
  }

  let inputs;
  try {
    inputs = JSON.parse(json);
  } catch {
    throw new Error("输入必须是有效 JSON 对象。");
  }
  if (!inputs || Array.isArray(inputs) || typeof inputs !== "object") {
    throw new Error("输入必须是 JSON 对象，例如 {\"topic\":\"release notes\"}。");
  }

  return { workflowId, inputs };
}

async function showStatus(ctx) {
  try {
    const config = await loadDifyConfig();
    const endpoint = new URL(config.serverUrl);
    ctx.ui.notify(`Dify 已配置: ${endpoint.origin}${endpoint.pathname}`, "success");
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "warning");
  }
}

async function runAndPublish({ pi, ctx, workflowId, inputs }) {
  const config = await loadDifyConfig();
  ctx.ui.notify("正在运行 Dify 工作流...", "info");
  const result = await runDifyWorkflow({
    ...config,
    workflowId,
    inputs,
    user: "pi-gui",
    signal: ctx.signal,
  });
  pi.sendMessage({
    customType: "dify-workflow",
    content: formatSuccess(result),
    display: true,
    details: result,
  });
  ctx.ui.notify("Dify 工作流已完成。", "success");
}

function publishFailure(pi, ctx, error) {
  const message = errorMessage(error);
  pi.sendMessage({
    customType: "dify-workflow",
    content: `Dify 工作流执行失败: ${message}`,
    display: true,
    details: { error: message },
  });
  ctx.ui.notify(`Dify 工作流执行失败: ${message}`, "error");
}

function formatSuccess(result) {
  return `Dify 工作流结果:\n${formatJson(result)}`;
}

function formatJson(value) {
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > MAX_RESULT_LENGTH
    ? `${serialized.slice(0, MAX_RESULT_LENGTH)}\n... 已截断`
    : serialized;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
