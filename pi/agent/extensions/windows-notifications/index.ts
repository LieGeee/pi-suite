import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
  buildEncodedToastCommand,
  classifyAgentEnd,
  messageText,
  parseNotificationCommand,
  summarizeNotificationText,
  type MessageLike,
  type NotificationKind,
} from "./core.js";

interface NotificationSettings {
  enabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = { enabled: true };
const CONFIG_FILE = "windows-notifications.json";
const POWERSHELL = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

function showWindowsToast(title: string, body: string): void {
  if (process.platform !== "win32") return;
  const child = spawn(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", buildEncodedToastCommand(title, body)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => undefined);
  child.unref();
}

async function loadSettings(path: string): Promise<NotificationSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(path, "utf8")) as Partial<NotificationSettings>;
    return { enabled: parsed.enabled !== false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("[windows-notifications] Failed to read settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(path: string, settings: NotificationSettings): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fs.rename(temporary, path);
}

export default function windowsNotifications(pi: ExtensionAPI) {
  const configPath = join(getAgentDir(), CONFIG_FILE);
  let settings: NotificationSettings = { ...DEFAULT_SETTINGS };

  pi.on("session_start", async () => {
    settings = await loadSettings(configPath);
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!settings.enabled || !ctx.hasUI || process.platform !== "win32") return;
    const messages = event.messages as readonly MessageLike[];
    const kind = classifyAgentEnd(messages);
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    const summary = summarizeNotificationText(messageText(assistant)) || "Agent 已结束本轮任务。";
    const project = basename(ctx.cwd) || ctx.cwd;
    const titles: Record<NotificationKind, string> = {
      complete: "Pi 任务已完成",
      failure: "Pi 任务失败",
      attention: "Pi 等待你的确认",
    };
    showWindowsToast(titles[kind], `${project}: ${summary}`);
  });

  pi.registerCommand("notify", {
    description: "管理 Windows 任务通知：/notify [status|test|on|off]",
    handler: async (args, ctx) => {
      const { action } = parseNotificationCommand(args);
      if (action === "invalid") {
        ctx.ui.notify("用法：/notify [status|test|on|off]", "warning");
        return;
      }
      if (action === "test") {
        showWindowsToast("Pi 通知测试", `${basename(ctx.cwd) || ctx.cwd}: Windows 通知已连接。`);
        ctx.ui.notify("已发送 Windows 测试通知", "info");
        return;
      }
      if (action === "on" || action === "off") {
        settings = { enabled: action === "on" };
        await saveSettings(configPath, settings);
      }
      ctx.ui.notify(`Windows 通知：${settings.enabled ? "已开启" : "已关闭"}`, "info");
    },
  });
}
