import type {
  DesktopComputerUsePrivacyPane,
  DesktopComputerUseStatus,
  DesktopComputerUseStatusValue,
} from "./ipc";
import { SettingsGroup, SettingsInfoRow, SettingsRow } from "./settings-utils";

interface SettingsComputerUseSectionProps {
  readonly status?: DesktopComputerUseStatus;
  readonly pending: boolean;
  readonly onRefresh: () => void;
  readonly onSetLockedUseEnabled: (enabled: boolean) => void;
  readonly onOpenPrivacySettings: (pane: DesktopComputerUsePrivacyPane) => void;
}

export function SettingsComputerUseSection({
  status,
  pending,
  onRefresh,
  onSetLockedUseEnabled,
  onOpenPrivacySettings,
}: SettingsComputerUseSectionProps) {
  return (
    <>
      <SettingsGroup title="状态">
        <SettingsRow title="辅助程序" description={status?.helperPath}>
          <span className="settings-row__value">{helperLabel(status, pending)}</span>
        </SettingsRow>
        <SettingsInfoRow label="桌面" value={desktopLabel(status?.desktop)} />
        <SettingsInfoRow label="前台应用" value={frontmostAppLabel(status?.frontmostApp)} />
        <SettingsInfoRow label="代理光标" value={cursorLabel(status?.cursor)} />
        <SettingsInfoRow label="光标覆盖层" value={cursorActivityLabel(status?.cursorActive)} />
        <SettingsInfoRow label="光标停留" value={durationLabel(status?.cursorDurationMs)} />
        <SettingsInfoRow label="光标滑动" value={durationLabel(status?.cursorGlideMs)} />
        <SettingsRow
          title="锁屏后继续操作"
          description="允许 pi-gui 在系统锁屏后继续当前的 Computer Use 回合。系统可能会要求管理员密码。"
        >
          <LockedUseControl
            status={status}
            pending={pending}
            onSetEnabled={onSetLockedUseEnabled}
          />
        </SettingsRow>
        <SettingsInfoRow label="锁屏功能安装状态" value={lockedUseInstallerLabel(status?.lockedUseInstaller)} />
        {status?.message ? <SettingsRow title="详情" description={status.message} /> : null}
        <SettingsRow title="刷新状态">
          <button className="button button--secondary" disabled={pending} type="button" onClick={onRefresh}>
            刷新
          </button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="系统权限">
        <SettingsRow title="辅助功能权限" description="检查控件和执行辅助功能操作时需要。">
          <PermissionControl
            label="辅助功能"
            status={status?.accessibility}
            onOpen={() => onOpenPrivacySettings("accessibility")}
          />
        </SettingsRow>
        <SettingsRow title="屏幕录制权限" description="获取 get_app_state 截图结果时需要。">
          <PermissionControl
            label="屏幕录制"
            status={status?.screenRecording}
            onOpen={() => onOpenPrivacySettings("screen-recording")}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function LockedUseControl({
  status,
  pending,
  onSetEnabled,
}: {
  readonly status?: DesktopComputerUseStatus;
  readonly pending: boolean;
  readonly onSetEnabled: (enabled: boolean) => void;
}) {
  const enabled = status?.lockedUse === "enabled";
  const buttonLabel = lockedUseActionLabel(status);
  return (
    <div className="settings-row__actions">
      <span className="settings-row__value">{lockedUseLabel(status?.lockedUse)}</span>
      {buttonLabel ? (
        <button className="button button--secondary" disabled={pending} type="button" onClick={() => onSetEnabled(!enabled)}>
          {buttonLabel}
        </button>
      ) : null}
    </div>
  );
}

function PermissionControl({
  label,
  status,
  onOpen,
}: {
  readonly label: "辅助功能" | "屏幕录制";
  readonly status?: DesktopComputerUseStatusValue;
  readonly onOpen: () => void;
}) {
  return (
    <div className="settings-row__actions">
      <span className="settings-row__value">{permissionLabel(status)}</span>
      {status !== "granted" ? (
        <button className="button button--secondary" type="button" onClick={onOpen}>
          打开{label}
        </button>
      ) : null}
    </div>
  );
}

export function desktopLabel(value: DesktopComputerUseStatus["desktop"] | undefined): string {
  switch (value) {
    case "locked":
      return "已锁定";
    case "unlocked":
      return "未锁定";
    default:
      return "未知";
  }
}

function frontmostAppLabel(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "未知";
}

export function cursorLabel(value: DesktopComputerUseStatus["cursor"] | undefined): string {
  switch (value) {
    case "enabled":
      return "已启用";
    case "disabled":
      return "已禁用";
    default:
      return "未知";
  }
}

export function cursorActivityLabel(value: DesktopComputerUseStatus["cursorActive"] | undefined): string {
  switch (value) {
    case "active":
      return "活跃";
    case "inactive":
      return "不活跃";
    default:
      return "未知";
  }
}

export function durationLabel(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}ms` : "未知";
}

function helperLabel(status: DesktopComputerUseStatus | undefined, pending: boolean): string {
  if (!status) {
    return pending ? "检查中..." : "未知";
  }
  return status.helperAvailable ? "可用" : "不可用";
}

export function lockedUseLabel(value: DesktopComputerUseStatus["lockedUse"] | undefined): string {
  switch (value) {
    case "enabled":
      return "已启用";
    case "not_enabled":
      return "未启用";
    default:
      return "未知";
  }
}

export function lockedUseInstallerLabel(value: DesktopComputerUseStatus["lockedUseInstaller"] | undefined): string {
  switch (value) {
    case "installed":
      return "已安装";
    case "not-installed":
      return "未安装";
    case "not-configured":
      return "未配置";
    case "partial":
      return "需要修复";
    default:
      return "未知";
  }
}

export function lockedUseActionLabel(status: DesktopComputerUseStatus | undefined): string | undefined {
  if (!status?.helperAvailable) {
    return undefined;
  }
  if (!status.lockedUseInstallerPath) {
    return undefined;
  }
  if (!["installed", "not-installed", "partial"].includes(status.lockedUseInstaller ?? "")) {
    return undefined;
  }
  if (status.lockedUse === "enabled") {
    return "禁用";
  }
  if (status.lockedUseInstaller === "partial") {
    return "修复";
  }
  return status.lockedUseInstaller === "not-installed" ? "启用" : undefined;
}

export function permissionLabel(value: DesktopComputerUseStatusValue | undefined): string {
  switch (value) {
    case "granted":
      return "已启用";
    case "denied":
      return "已关闭";
    default:
      return "未知";
  }
}
