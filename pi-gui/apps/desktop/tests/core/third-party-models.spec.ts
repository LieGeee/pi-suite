import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  desktopShortcut,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("adds a third-party model provider from a full API type dropdown", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("third-party-models-workspace");
  await seedAgentDir(agentDir, {
    withOpenAiAuth: false,
    withDefaultModel: false,
    enabledModels: [],
  });
  const modelServer = await startModelServer();

  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    await window.keyboard.press(desktopShortcut(","));
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    await window.getByRole("button", { name: "模型", exact: true }).click();

    await expect(window.getByText("第三方快速配置", { exact: true })).toBeVisible();
    await window.getByLabel("提供商名称").fill("Claude 网关");
    await window.getByLabel("提供商 ID").fill("claude-gateway");
    await window.getByLabel("基础 URL").fill(modelServer.baseUrl);
    await window.getByLabel("API 密钥").fill("third-party-test-key");

    const apiType = window.getByLabel("API 类型");
    await expect(apiType.locator("option")).toHaveText([
      "OpenAI Chat Completions",
      "OpenAI Responses",
      "Anthropic Messages",
      "Google Generative AI",
    ]);
    await apiType.selectOption("anthropic-messages");

    await window.getByRole("button", { name: "获取模型列表" }).click();
    await expect(window.getByText("Claude Sonnet 4", { exact: true })).toBeVisible();
    await window.getByRole("checkbox", { name: /Claude Sonnet 4/ }).check();
    await window.getByRole("button", { name: "保存第三方模型" }).click();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const runtime = Object.values(state.runtimeByWorkspace)[0];
        return runtime?.models.some(
          (model) => model.providerId === "claude-gateway" && model.modelId === "claude-sonnet-4",
        );
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const runtime = Object.values(state.runtimeByWorkspace)[0];
        return runtime?.settings.enabledModelPatterns.includes("claude-gateway/claude-sonnet-4");
      })
      .toBe(true);

    const modelsJson = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8")) as {
      readonly providers?: Record<string, {
        readonly api?: unknown;
        readonly baseUrl?: unknown;
        readonly apiKey?: unknown;
        readonly models?: readonly { readonly id?: unknown; readonly name?: unknown }[];
      }>;
    };
    expect(modelsJson.providers?.["claude-gateway"]?.api).toBe("anthropic-messages");
    expect(modelsJson.providers?.["claude-gateway"]?.baseUrl).toBe(modelServer.baseUrl);
    expect(modelsJson.providers?.["claude-gateway"]?.apiKey).toBe("third-party-test-key");
    expect(modelsJson.providers?.["claude-gateway"]?.models?.[0]?.id).toBe("claude-sonnet-4");
  } finally {
    await harness.close();
    await modelServer.close();
  }
});

async function startModelServer(): Promise<{ readonly baseUrl: string; readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (!request.url?.includes("models")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data: [
          {
            id: "claude-sonnet-4",
            display_name: "Claude Sonnet 4",
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start model server");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
