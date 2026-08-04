import type { DesktopNotificationPermissionStatus } from "./ipc";
import type { NotificationPreferences } from "./desktop-state";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface SettingsNotificationsSectionProps {
  readonly notificationPreferences: NotificationPreferences;
  readonly notificationPermissionStatus: DesktopNotificationPermissionStatus;
  readonly notificationPermissionPending: boolean;
  readonly onSetNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void;
  readonly onRequestNotificationPermission: () => void;
  readonly onOpenSystemNotificationSettings: () => void;
}

export function SettingsNotificationsSection({
  notificationPreferences,
  notificationPermissionStatus,
  notificationPermissionPending,
  onSetNotificationPreferences,
  onRequestNotificationPermission,
  onOpenSystemNotificationSettings,
}: SettingsNotificationsSectionProps) {
  const statusLabel = labelForPermissionStatus(notificationPermissionStatus);
  const statusDescription = descriptionForPermissionStatus(notificationPermissionStatus);
  const showAskMacOs = notificationPermissionStatus === "default";
  const showOpenSystemSettings = notificationPermissionStatus === "denied";
  const showRecoveryActions = showAskMacOs || showOpenSystemSettings;

  return (
    <>
      <SettingsGroup title="系统通知" description="系统决定 pi-gui 是否可以显示桌面通知。">
        <SettingsRow title="系统通知权限" description={statusDescription}>
          <span className="settings-row__value">{statusLabel}</span>
        </SettingsRow>
        {showRecoveryActions ? (
          <SettingsRow
            title="开启通知"
            description={
              showAskMacOs
                ? "当活动任务第一次转入后台时，pi-gui 会向系统申请通知权限。你现在也可以主动申请。"
                : "系统通知当前已对 pi-gui 关闭。请打开系统设置重新启用。"
            }
          >
            <div className="settings-row__actions">
              {showAskMacOs ? (
                <button
                  className="button button--secondary"
                  disabled={notificationPermissionPending}
                  type="button"
                  onClick={onRequestNotificationPermission}
                >
                  请求系统授权
                </button>
              ) : null}
              {showOpenSystemSettings ? (
                <button
                  className="button button--secondary"
                  disabled={notificationPermissionPending}
                  type="button"
                  onClick={onOpenSystemNotificationSettings}
                >
                  打开系统设置
                </button>
              ) : null}
            </div>
          </SettingsRow>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="应用内提醒" description="选择在系统通知权限开启后，哪些后台事件需要提醒你。">
        <SettingsRow title="后台完成" description="后台会话完成时提醒。">
          <input
            aria-label="后台完成"
            checked={notificationPreferences.backgroundCompletion}
            type="checkbox"
            onChange={(event) => onSetNotificationPreferences({ backgroundCompletion: event.target.checked })}
          />
        </SettingsRow>
        <SettingsRow title="后台失败" description="后台会话失败时提醒。">
          <input
            aria-label="后台失败"
            checked={notificationPreferences.backgroundFailure}
            type="checkbox"
            onChange={(event) => onSetNotificationPreferences({ backgroundFailure: event.target.checked })}
          />
        </SettingsRow>
        <SettingsRow title="需要输入或确认" description="当需要你输入内容或确认操作时提醒。">
          <input
            aria-label="需要输入或确认"
            checked={notificationPreferences.attentionNeeded}
            type="checkbox"
            onChange={(event) => onSetNotificationPreferences({ attentionNeeded: event.target.checked })}
          />
        </SettingsRow>
        <SettingsRow title="提示音" description="完成、失败或需要处理时播放提示音。">
          <input
            aria-label="提示音"
            checked={notificationPreferences.soundEnabled}
            type="checkbox"
            onChange={(event) => onSetNotificationPreferences({ soundEnabled: event.target.checked })}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function labelForPermissionStatus(status: DesktopNotificationPermissionStatus): string {
  switch (status) {
    case "granted":
      return "已启用";
    case "denied":
      return "已关闭";
    case "default":
      return "尚未启用";
    case "unsupported":
      return "不可用";
    default:
      return "检查中…";
  }
}

function descriptionForPermissionStatus(status: DesktopNotificationPermissionStatus): string {
  switch (status) {
    case "granted":
      return "系统允许 pi-gui 为后台对话更新显示桌面通知。";
    case "denied":
      return "系统通知已对 pi-gui 关闭。请在系统设置中启用，以接收后台完成提醒。";
    case "default":
      return "pi-gui 还没有向系统申请桌面通知权限。";
    case "unsupported":
      return "当前系统不支持桌面通知。";
    default:
      return "正在检查系统通知是否可用于 pi-gui。";
  }
}
