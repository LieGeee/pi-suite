import { useEffect, useState } from "react";
import type { MobileSyncPermissions, MobileSyncSettings } from "./desktop-state";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface SettingsMobileSyncSectionProps {
  readonly mobileSync: MobileSyncSettings;
  readonly onSetMobileSyncSettings: (settings: MobileSyncSettings) => void;
  readonly onGenerateMobileSyncPairQrCode?: (relayUrl: string) => Promise<{ pairToken: string; qrImage: string; qrData: string }>;
}

const permissionRows: readonly {
  readonly key: keyof MobileSyncPermissions;
  readonly title: string;
  readonly description: string;
}[] = [
  {
    key: "taskList",
    title: "查看任务列表",
    description: "允许移动端查看当前桌面的工作区、任务列表、状态和分组。",
  },
  {
    key: "conversationDetails",
    title: "查看对话详情",
    description: "允许移动端打开任务并查看消息、工具调用和运行状态。",
  },
  {
    key: "notifications",
    title: "消息通知",
    description: "允许桌面端把完成、失败和需要接管等事件同步给手机。",
  },
  {
    key: "sendMessages",
    title: "发送消息/继续对话",
    description: "允许手机端向当前任务发送追问、继续对话或插话。",
  },
  {
    key: "stopRuns",
    title: "停止运行中的任务",
    description: "允许手机端停止当前正在运行的任务。",
  },
  {
    key: "createSessions",
    title: "新建任务",
    description: "允许手机端在当前桌面工作区创建新任务。",
  },
];

export function SettingsMobileSyncSection({
  mobileSync,
  onSetMobileSyncSettings,
  onGenerateMobileSyncPairQrCode,
}: SettingsMobileSyncSectionProps) {
  const [draft, setDraft] = useState(() => withDefaultDesktopRelayUrl(mobileSync));
  const [lastSyncedSettingsKey, setLastSyncedSettingsKey] = useState(() => mobileSyncSettingsKey(mobileSync));

  useEffect(() => {
    const nextKey = mobileSyncSettingsKey(mobileSync);
    if (nextKey === lastSyncedSettingsKey) {
      return;
    }
    setDraft(withDefaultDesktopRelayUrl(mobileSync));
    setLastSyncedSettingsKey(nextKey);
  }, [lastSyncedSettingsKey, mobileSync]);

  const updateDraft = (patch: Partial<MobileSyncSettings>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
      permissions: patch.permissions ?? current.permissions,
    }));
  };

  const updatePermission = (key: keyof MobileSyncPermissions, value: boolean) => {
    setDraft((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: value,
      },
    }));
  };

  const [qrImage, setQrImage] = useState<string | undefined>();
  const [qrGenerating, setQrGenerating] = useState(false);

  const generateQrCode = async () => {
    const nextDraft = withDefaultDesktopRelayUrl(draft);
    if (!nextDraft.serverUrl.trim() || !onGenerateMobileSyncPairQrCode) {
      return;
    }
    setQrGenerating(true);
    setQrImage(undefined);
    try {
      const result = await onGenerateMobileSyncPairQrCode(nextDraft.serverUrl.trim());
      setQrImage(result.qrImage);
      updateDraft({ pairToken: result.pairToken });
      if (result.pairToken) {
        // Also auto-save with the new token
        onSetMobileSyncSettings({
          ...nextDraft,
          pairToken: result.pairToken,
          permissions: nextDraft.permissions,
        });
      }
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    } finally {
      setQrGenerating(false);
    }
  };

  return (
    <>
      <SettingsGroup
        title="移动端同步"
        description="连接你的同步服务器，让手机端查看通知、任务列表、对话详情并按授权控制任务。"
      >
        <SettingsRow title="连接状态" description={descriptionForMobileSyncStatus(mobileSync)}>
          <span className="settings-row__value">{labelForMobileSyncStatus(mobileSync)}</span>
        </SettingsRow>
        <SettingsRow title="服务器地址" description="Windows 端使用 /ws/desktop；手机端扫码后会自动改成 /ws/mobile。">
          <input
            aria-label="移动端同步服务器地址"
            className="settings-text-input"
            placeholder="ws://localhost:8787/ws/desktop"
            value={draft.serverUrl}
            onChange={(event) => updateDraft({ serverUrl: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow title="配对 Token" description="用于服务器识别这台桌面端，打包文件不会包含你的个人 Token。">
          <input
            aria-label="配对 Token"
            className="settings-text-input"
            placeholder="粘贴服务器生成的配对码或 token"
            value={draft.pairToken}
            onChange={(event) => updateDraft({ pairToken: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow title="保存配置" description="保存后桌面端会按当前地址尝试建立移动端同步连接。">
          <button
            className="button button--primary"
            type="button"
            onClick={() => onSetMobileSyncSettings(withDefaultDesktopRelayUrl(draft))}
          >
            保存移动端同步设置
          </button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="生成配对二维码"
        description="在 relay 服务器上创建一个新的配对 Token 并生成二维码，用手机 App 扫码即可自动连接。"
      >
        <SettingsRow
          title="生成配对"
          description={draft.serverUrl.trim() ? "点击按钮后桌面端会向 relay 请求新的配对 Token" : "请先填写上面的服务器地址"}
        >
          <button
            className="button button--primary"
            type="button"
            disabled={!onGenerateMobileSyncPairQrCode || qrGenerating}
            onClick={generateQrCode}
          >
            {qrGenerating ? "生成中..." : "生成配对二维码"}
          </button>
        </SettingsRow>
        {qrImage ? (
          <SettingsRow title="扫描二维码" description="打开 pi-gui 手机 App，在设置页扫一扫连接。">
            <div className="qr-code-container">
              <img src={qrImage} alt="配对二维码" className="qr-code-image" />
            </div>
          </SettingsRow>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="移动端权限" description="默认开放查看、通知和发送；可在此关闭不需要的控制权限。">
        {permissionRows.map((row) => (
          <SettingsRow key={row.key} title={row.title} description={row.description}>
            <input
              aria-label={row.title}
              checked={draft.permissions[row.key]}
              type="checkbox"
              onChange={(event) => updatePermission(row.key, event.target.checked)}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </>
  );
}

function withDefaultDesktopRelayUrl(settings: MobileSyncSettings): MobileSyncSettings {
  return {
    ...settings,
    serverUrl: settings.serverUrl.trim() || "ws://localhost:8787/ws/desktop",
  };
}

function mobileSyncSettingsKey(settings: MobileSyncSettings): string {
  return JSON.stringify({
    serverUrl: settings.serverUrl,
    pairToken: settings.pairToken,
    permissions: settings.permissions,
  });
}

function labelForMobileSyncStatus(settings: MobileSyncSettings): string {
  switch (settings.connectionStatus) {
    case "connecting":
      return "连接中";
    case "connected":
      return "已连接";
    case "disconnected":
      return "已断开";
    case "auth-failed":
      return "鉴权失败";
    default:
      return "未配置服务器地址";
  }
}

function descriptionForMobileSyncStatus(settings: MobileSyncSettings): string {
  if (!settings.serverUrl.trim()) {
    return "未配置服务器地址。填入服务器地址和配对 Token 后即可连接。";
  }
  if (settings.lastError) {
    return settings.lastError;
  }
  if (settings.lastConnectedAt) {
    return `上次连接：${settings.lastConnectedAt}`;
  }
  return "保存配置后会开始连接同步服务器。";
}
