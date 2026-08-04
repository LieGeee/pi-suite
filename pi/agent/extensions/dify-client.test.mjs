import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadDifyConfig, runDifyWorkflow } from "./dify-client.mjs";

test("loads the GUI-saved Dify endpoint and key when environment overrides are absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-dify-"));
  const statePath = join(directory, "ui-state.json");
  await writeFile(statePath, JSON.stringify({
    difyConfig: {
      serverUrl: "https://dify.example.test/v1/",
      apiKey: "app-from-gui",
    },
  }), "utf8");

  try {
    const config = await loadDifyConfig({ env: {}, guiStatePath: statePath });
    assert.deepEqual(config, {
      serverUrl: "https://dify.example.test/v1",
      apiKey: "app-from-gui",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runs the current published workflow with the configured app key", async () => {
  let received;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: { status: "succeeded", outputs: { answer: "done" } } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");

  try {
    const result = await runDifyWorkflow({
      serverUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: "app-test-key",
      inputs: { document: "report.md" },
      user: "pi-gui",
    });

    assert.deepEqual(received, {
      url: "/v1/workflows/run",
      authorization: "Bearer app-test-key",
      body: {
        inputs: { document: "report.md" },
        response_mode: "blocking",
        user: "pi-gui",
      },
    });
    assert.deepEqual(result, { status: "succeeded", outputs: { answer: "done" } });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runs a specified published workflow version", async () => {
  let requestUrl = "";
  const server = createServer((request, response) => {
    requestUrl = request.url ?? "";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: { status: "succeeded", outputs: {} } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");

  try {
    await runDifyWorkflow({
      serverUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: "app-test-key",
      workflowId: "workflow-v2",
      inputs: {},
      user: "pi-gui",
    });
    assert.equal(requestUrl, "/v1/workflows/workflow-v2/run");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
