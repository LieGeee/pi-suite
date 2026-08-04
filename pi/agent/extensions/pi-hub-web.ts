import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

type PiExtensionAPI = {
  registerCommand: (name: string, options: { description: string; handler: (args: string, ctx: PiCommandContext) => Promise<void> }) => void;
};

type PiCommandContext = {
  ui: {
    notify: (message: string, level: "info" | "success" | "warning" | "error") => void;
  };
};

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 4319;
const DEFAULT_ROOT = "S:/code/hermes-hub";
const DEFAULT_OPENHUMAN_ROOT = "S:/tool/openhuman/openhuman-src";
const DEFAULT_OPENHUMAN_WEB_URL = "http://127.0.0.1:1420";
const DEFAULT_OMNIGRAPH_ROOT = "S:/tool/omnigraph/OmniGraph";
const DEFAULT_OMNIGRAPH_WEB_URL = "http://127.0.0.1:4320";
const DEFAULT_AGENTMEMORY_URL = "http://127.0.0.1:3111";
const DEFAULT_AGENTMEMORY_VIEWER_URL = "http://127.0.0.1:3113";
const DEFAULT_AGENTMEMORY_COMMAND = "npx -y @agentmemory/agentmemory@0.9.21";
const START_TIMEOUT_MS = 20_000;
const OPENHUMAN_START_TIMEOUT_MS = 30_000;
const OMNIGRAPH_START_TIMEOUT_MS = 20_000;
const AGENTMEMORY_START_TIMEOUT_MS = 20_000;
const COMMANDS = ["hub", "pihub", "pi-hub", "web", "resume-hub", "resume-web"];

export default function piHubWebExtension(pi: PiExtensionAPI) {
  for (const name of COMMANDS) {
    pi.registerCommand(name, {
      description: "Start Pi Hub Web UI and open it in the browser",
      handler: openPiHubWeb,
    });
  }
}

async function openPiHubWeb(args: string, ctx: PiCommandContext): Promise<void> {
  const options = parseArgs(args);
  const root = resolve(options.root);
  if (!existsSync(resolve(root, "package.json"))) {
    ctx.ui.notify(`Cannot find Pi Hub project root: ${root}`, "error");
    return;
  }

  let url = options.url;
  let port = options.port;
  if (!url) {
    port = await choosePort(DEFAULT_PORT);
    url = `http://${DEFAULT_HOST}:${port}`;
  }

  ctx.ui.notify(`Opening Pi Hub Web UI: ${url}`, "info");

  if (!options.noOpenHuman) {
    await ensureOpenHumanWeb(options.openhumanRoot, options.openhumanWebUrl, ctx);
  }

  if (!options.noOmnigraph) {
    await ensureOmniGraphWeb(options.omnigraphRoot, options.omnigraphWebUrl, options.omnigraphProjectPath ?? root, ctx);
  }

  if (!options.noAgentMemory) {
    await ensureAgentMemory(options.agentMemoryUrl, options.agentMemoryViewerUrl, options.agentMemoryCommand, ctx);
  }

  if (!(await isPiHubReachable(url))) {
    startDevServer(root, port);
    const ready = await waitUntilReachable(url, START_TIMEOUT_MS, isPiHubReachable);
    if (!ready) {
      ctx.ui.notify(`Started npm run dev on port ${port}, but ${url} was not reachable within ${START_TIMEOUT_MS / 1000}s. Try again shortly.`, "warning");
    }
  }

  if (!options.noOpen) openBrowser(url);
  ctx.ui.notify(`Pi Hub Web UI: ${url}`, "success");
}

function parseArgs(args: string): { url: string | null; port: number; root: string; noOpen: boolean; noOpenHuman: boolean; openhumanRoot: string; openhumanWebUrl: string; noOmnigraph: boolean; omnigraphRoot: string; omnigraphWebUrl: string; omnigraphProjectPath: string | null; noAgentMemory: boolean; agentMemoryUrl: string; agentMemoryViewerUrl: string; agentMemoryCommand: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const explicitUrl = parts.find((part) => part.startsWith("http://") || part.startsWith("https://")) ?? process.env.PI_HUB_WEB_URL ?? null;
  const rootFlagIndex = parts.findIndex((part) => part === "--root");
  const portFlagIndex = parts.findIndex((part) => part === "--port");
  const openhumanRootFlagIndex = parts.findIndex((part) => part === "--openhuman-root");
  const openhumanWebUrlFlagIndex = parts.findIndex((part) => part === "--openhuman-web-url");
  const omnigraphRootFlagIndex = parts.findIndex((part) => part === "--omnigraph-root");
  const omnigraphWebUrlFlagIndex = parts.findIndex((part) => part === "--omnigraph-web-url");
  const omnigraphProjectFlagIndex = parts.findIndex((part) => part === "--omnigraph-project");
  const agentMemoryUrlFlagIndex = parts.findIndex((part) => part === "--agentmemory-url");
  const agentMemoryViewerUrlFlagIndex = parts.findIndex((part) => part === "--agentmemory-viewer-url");
  const agentMemoryCommandFlagIndex = parts.findIndex((part) => part === "--agentmemory-command");
  const root = rootFlagIndex >= 0 && parts[rootFlagIndex + 1] ? parts[rootFlagIndex + 1] : process.env.PI_HUB_ROOT ?? DEFAULT_ROOT;
  const port = portFlagIndex >= 0 && parts[portFlagIndex + 1] ? Number(parts[portFlagIndex + 1]) : explicitUrl ? Number(new URL(explicitUrl).port || DEFAULT_PORT) : DEFAULT_PORT;
  const openhumanRoot = openhumanRootFlagIndex >= 0 && parts[openhumanRootFlagIndex + 1] ? parts[openhumanRootFlagIndex + 1] : process.env.OPENHUMAN_ROOT ?? DEFAULT_OPENHUMAN_ROOT;
  const openhumanWebUrl = openhumanWebUrlFlagIndex >= 0 && parts[openhumanWebUrlFlagIndex + 1] ? parts[openhumanWebUrlFlagIndex + 1] : process.env.OPENHUMAN_WEB_URL ?? DEFAULT_OPENHUMAN_WEB_URL;
  const omnigraphRoot = omnigraphRootFlagIndex >= 0 && parts[omnigraphRootFlagIndex + 1] ? parts[omnigraphRootFlagIndex + 1] : process.env.OMNIGRAPH_ROOT ?? DEFAULT_OMNIGRAPH_ROOT;
  const omnigraphWebUrl = omnigraphWebUrlFlagIndex >= 0 && parts[omnigraphWebUrlFlagIndex + 1] ? parts[omnigraphWebUrlFlagIndex + 1] : process.env.OMNIGRAPH_WEB_URL ?? DEFAULT_OMNIGRAPH_WEB_URL;
  const omnigraphProjectPath = omnigraphProjectFlagIndex >= 0 && parts[omnigraphProjectFlagIndex + 1] ? parts[omnigraphProjectFlagIndex + 1] : process.env.OMNIGRAPH_PROJECT_PATH ?? null;
  const agentMemoryUrl = agentMemoryUrlFlagIndex >= 0 && parts[agentMemoryUrlFlagIndex + 1] ? parts[agentMemoryUrlFlagIndex + 1] : process.env.AGENTMEMORY_URL ?? DEFAULT_AGENTMEMORY_URL;
  const agentMemoryViewerUrl = agentMemoryViewerUrlFlagIndex >= 0 && parts[agentMemoryViewerUrlFlagIndex + 1] ? parts[agentMemoryViewerUrlFlagIndex + 1] : process.env.AGENTMEMORY_VIEWER_URL ?? DEFAULT_AGENTMEMORY_VIEWER_URL;
  const agentMemoryCommand = agentMemoryCommandFlagIndex >= 0 && parts[agentMemoryCommandFlagIndex + 1] ? parts[agentMemoryCommandFlagIndex + 1] : process.env.AGENTMEMORY_COMMAND ?? DEFAULT_AGENTMEMORY_COMMAND;
  return { url: explicitUrl, port, root, noOpen: parts.includes("--no-open"), noOpenHuman: parts.includes("--no-openhuman"), openhumanRoot, openhumanWebUrl, noOmnigraph: parts.includes("--no-omnigraph"), omnigraphRoot, omnigraphWebUrl, omnigraphProjectPath, noAgentMemory: parts.includes("--no-agentmemory"), agentMemoryUrl, agentMemoryViewerUrl, agentMemoryCommand };
}

async function choosePort(startPort: number): Promise<number> {
  if (await isPiHubReachable(`http://${DEFAULT_HOST}:${startPort}`)) return startPort;
  for (let port = startPort; port < startPort + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + 99}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => server.close(() => resolvePort(true)));
    server.listen(port, DEFAULT_HOST);
  });
}

function startDevServer(cwd: string, port: number): void {
  const commandLine = `npm run dev -- --port ${port}`;
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }

  const child = spawn("sh", ["-lc", commandLine], {
    cwd,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function ensureOpenHumanWeb(root: string, webUrl: string, ctx: PiCommandContext): Promise<void> {
  if (await isGenericWebReachable(webUrl)) {
    ctx.ui.notify(`OpenHuman Web already running: ${webUrl}`, "success");
    return;
  }

  const resolvedRoot = resolve(root);
  if (!existsSync(resolve(resolvedRoot, "package.json"))) {
    ctx.ui.notify(`OpenHuman root not found, skipped: ${resolvedRoot}`, "warning");
    return;
  }

  ctx.ui.notify(`Starting OpenHuman Web: ${webUrl}`, "info");
  startOpenHumanWeb(resolvedRoot, webUrl);
  const ready = await waitUntilReachable(webUrl, OPENHUMAN_START_TIMEOUT_MS, isGenericWebReachable);
  if (ready) {
    ctx.ui.notify(`OpenHuman Web ready: ${webUrl}`, "success");
    return;
  }
  ctx.ui.notify(`Started OpenHuman Web, but ${webUrl} was not reachable within ${OPENHUMAN_START_TIMEOUT_MS / 1000}s. It may still be installing/building.`, "warning");
}

function startOpenHumanWeb(cwd: string, webUrl: string): void {
  const parsed = new URL(webUrl);
  const host = parsed.hostname || "127.0.0.1";
  const port = parsed.port || "1420";
  const commandLine = `pnpm dev -- --host ${host} --port ${port}`;
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const child = spawn("sh", ["-lc", commandLine], { cwd, detached: true, stdio: "ignore" });
  child.unref();
}

async function ensureOmniGraphWeb(root: string, webUrl: string, projectPath: string, ctx: PiCommandContext): Promise<void> {
  if (await isGenericWebReachable(webUrl)) {
    ctx.ui.notify(`OmniGraph Web already running: ${webUrl}`, "success");
    return;
  }

  const resolvedRoot = resolve(root);
  const cliPath = resolve(resolvedRoot, "packages", "cli", "dist", "index.js");
  if (!existsSync(cliPath)) {
    ctx.ui.notify(`OmniGraph build not found, skipped: ${cliPath}`, "warning");
    return;
  }

  const resolvedProjectPath = resolve(projectPath);
  if (!existsSync(resolvedProjectPath)) {
    ctx.ui.notify(`OmniGraph project path not found, skipped: ${resolvedProjectPath}`, "warning");
    return;
  }

  ctx.ui.notify(`Starting OmniGraph Web: ${webUrl}`, "info");
  startOmniGraphWeb(resolvedRoot, cliPath, resolvedProjectPath, webUrl);
  const ready = await waitUntilReachable(webUrl, OMNIGRAPH_START_TIMEOUT_MS, isGenericWebReachable);
  if (ready) {
    ctx.ui.notify(`OmniGraph Web ready: ${webUrl}`, "success");
    return;
  }
  ctx.ui.notify(`Started OmniGraph Web, but ${webUrl} was not reachable within ${OMNIGRAPH_START_TIMEOUT_MS / 1000}s.`, "warning");
}

function startOmniGraphWeb(cwd: string, cliPath: string, projectPath: string, webUrl: string): void {
  const parsed = new URL(webUrl);
  const port = parsed.port || "4320";
  const args = [cliPath, "--path", projectPath, "serve", "--port", port];
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function ensureAgentMemory(apiUrl: string, viewerUrl: string, command: string, ctx: PiCommandContext): Promise<void> {
  if (await isAgentMemoryReachable(apiUrl)) {
    ctx.ui.notify(`AgentMemory REST already running: ${apiUrl}`, "success");
    return;
  }

  ctx.ui.notify(`Starting AgentMemory REST: ${apiUrl}`, "info");
  startAgentMemory(command, apiUrl);
  const ready = await waitUntilReachable(apiUrl, AGENTMEMORY_START_TIMEOUT_MS, isAgentMemoryReachable);
  if (ready) {
    ctx.ui.notify(`AgentMemory REST ready: ${apiUrl}; viewer: ${viewerUrl}`, "success");
    return;
  }
  ctx.ui.notify(`Started AgentMemory, but ${apiUrl} was not reachable within ${AGENTMEMORY_START_TIMEOUT_MS / 1000}s. It may still be installing/starting.`, "warning");
}

function startAgentMemory(command: string, apiUrl: string): void {
  const commandLine = buildAgentMemoryStartCommand(command, apiUrl);
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const child = spawn("sh", ["-lc", commandLine], { detached: true, stdio: "ignore" });
  child.unref();
}

function buildAgentMemoryStartCommand(command: string, apiUrl: string): string {
  const parsed = new URL(apiUrl);
  const port = parsed.port || "3111";
  return `${command} --port ${port}`;
}

async function waitUntilReachable(url: string, timeoutMs: number, probe: (url: string) => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function isPiHubReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/status`, { method: "GET" });
    if (!response.ok) return false;
    const data = await response.json() as { hermes?: unknown };
    return Boolean(data.hermes);
  } catch {
    return false;
  }
}

async function isGenericWebReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function isAgentMemoryReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/agentmemory/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
