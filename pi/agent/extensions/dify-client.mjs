import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_GUI_DATA_DIR = "S:/tool/pi/gui-data";

export async function loadDifyConfig({
  env = process.env,
  guiStatePath = env.DIFY_GUI_STATE_PATH ?? join(env.PI_GUI_DATA_DIR ?? DEFAULT_GUI_DATA_DIR, "ui-state.json"),
} = {}) {
  const environmentUrl = env.DIFY_API_URL?.trim();
  const environmentKey = env.DIFY_API_KEY?.trim();
  if (environmentUrl || environmentKey) {
    if (!environmentUrl || !environmentKey) {
      throw new Error("DIFY_API_URL and DIFY_API_KEY must be set together.");
    }
    return normalizeConfig({ serverUrl: environmentUrl, apiKey: environmentKey });
  }

  let state;
  try {
    state = JSON.parse(await readFile(guiStatePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error("Dify is not configured. Set it in pi-gui Settings > Dify, or set DIFY_API_URL and DIFY_API_KEY.");
    }
    throw new Error(`Cannot read the Dify configuration: ${error instanceof Error ? error.message : String(error)}`);
  }

  return normalizeConfig(state?.difyConfig);
}

export async function runDifyWorkflow({ serverUrl, apiKey, workflowId, inputs, user, signal, fetchImpl = fetch }) {
  const config = normalizeConfig({ serverUrl, apiKey });
  const normalizedWorkflowId = workflowId?.trim();
  const endpoint = normalizedWorkflowId
    ? `${config.serverUrl}/workflows/${encodeURIComponent(normalizedWorkflowId)}/run`
    : `${config.serverUrl}/workflows/run`;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: inputs ?? {},
      response_mode: "blocking",
      user: user?.trim() || "pi-gui",
    }),
    signal,
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const description = describeDifyFailure(payload);
    throw new Error(`Dify workflow request failed (${response.status}): ${description}`);
  }

  return payload?.data ?? payload;
}

function normalizeConfig(value) {
  const serverUrl = value?.serverUrl?.trim();
  const apiKey = value?.apiKey?.trim();
  if (!serverUrl || !apiKey) {
    throw new Error("Dify is not configured. Set both the server URL and API key in pi-gui Settings > Dify, or set DIFY_API_URL and DIFY_API_KEY.");
  }

  let parsed;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new Error("Dify server URL must be an absolute HTTP or HTTPS URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Dify server URL must use HTTP or HTTPS.");
  }

  return {
    serverUrl: parsed.toString().replace(/\/+$/, ""),
    apiKey,
  };
}

async function readJsonResponse(response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return { message: body.slice(0, 500) };
  }
}

function describeDifyFailure(payload) {
  if (typeof payload?.message === "string" && payload.message) return payload.message;
  if (typeof payload?.error === "string" && payload.error) return payload.error;
  if (typeof payload?.code === "string" && payload.code) return payload.code;
  return "Unexpected Dify response.";
}
