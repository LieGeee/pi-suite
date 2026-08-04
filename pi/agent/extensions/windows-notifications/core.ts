export type NotificationKind = "complete" | "failure" | "attention";
export type NotificationCommand = "status" | "test" | "on" | "off" | "invalid";

export interface MessageLike {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: unknown;
}

export function messageText(message: MessageLike | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string"),
    )
    .map((part) => part.text)
    .join("\n");
}

export function classifyAgentEnd(messages: readonly MessageLike[]): NotificationKind {
  const assistant = [...messages].reverse().find((message) => message.role === "assistant");
  const hasToolFailure = messages.some((message) =>
    message.role === "toolResult" && Boolean((message as MessageLike & { isError?: boolean }).isError),
  );
  if (hasToolFailure || assistant?.stopReason === "error" || assistant?.errorMessage) return "failure";

  const text = messageText(assistant).trim();
  const asksForInput = /(?:[?？]\s*$|请(?:确认|选择|提供|告诉我|回复)|是否(?:继续|允许|同意)|需要你(?:确认|选择|提供)|回复(?:编号|选项))/u.test(text);
  return asksForInput ? "attention" : "complete";
}

export function summarizeNotificationText(text: string, maxLength = 120): string {
  const singleLine = text.replace(/\s+/gu, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function parseNotificationCommand(input: string): { action: NotificationCommand } {
  const action = input.trim().toLowerCase() || "status";
  if (action === "status" || action === "test" || action === "on" || action === "off") return { action };
  return { action: "invalid" };
}

export function buildEncodedToastCommand(title: string, body: string): string {
  const titleBase64 = Buffer.from(title, "utf8").toString("base64");
  const bodyBase64 = Buffer.from(body, "utf8").toString("base64");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
    `$title = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${titleBase64}'))`,
    `$body = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${bodyBase64}'))`,
    "$title = [Security.SecurityElement]::Escape($title)",
    "$body = [Security.SecurityElement]::Escape($body)",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "$xml.LoadXml(\"<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual><audio src='ms-winsoundevent:Notification.Default'/></toast>\")",
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('pi')",
    "$notifier.Show($toast)",
  ].join("\r\n");
  return Buffer.from(script, "utf16le").toString("base64");
}
