import { useEffect, useState } from "react";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type { ModelSettingsScopeMode } from "./desktop-state";
import { SettingsGroup, SettingsInfoRow, SettingsRow } from "./settings-utils";

interface SettingsGeneralSectionProps {
  readonly runtime?: RuntimeSnapshot;
  readonly modelSettingsScopeMode: ModelSettingsScopeMode;
  readonly integratedTerminalShell: string;
  readonly onSetModelSettingsScopeMode: (mode: ModelSettingsScopeMode) => void;
  readonly onSetIntegratedTerminalShell: (shellPath: string) => void;
  readonly onToggleSkillCommands: (enabled: boolean) => void;
}

export function SettingsGeneralSection({
  runtime,
  modelSettingsScopeMode,
  integratedTerminalShell,
  onSetModelSettingsScopeMode,
  onSetIntegratedTerminalShell,
  onToggleSkillCommands,
}: SettingsGeneralSectionProps) {
  const connectedCount = runtime?.providers.filter((p) => p.hasAuth).length ?? 0;
  const [terminalShellDraft, setTerminalShellDraft] = useState(integratedTerminalShell);

  useEffect(() => {
    setTerminalShellDraft(integratedTerminalShell);
  }, [integratedTerminalShell]);

  const commitTerminalShellDraft = () => {
    if (terminalShellDraft !== integratedTerminalShell) {
      onSetIntegratedTerminalShell(terminalShellDraft);
    }
  };

  return (
    <>
      <SettingsGroup title="通用">
        <SettingsInfoRow
          label="已连接提供商"
          value={connectedCount > 0 ? String(connectedCount) : "无"}
        />
        <SettingsInfoRow label="已发现技能" value={String(runtime?.skills.length ?? 0)} />
        <SettingsRow title="模型设置作用域" description="选择默认模型设置是全局生效，还是按仓库分别生效。">
          <div className="settings-pill-row">
            <button
              className={`settings-pill${modelSettingsScopeMode === "app-global" ? " settings-pill--active" : ""}`}
              type="button"
              aria-pressed={modelSettingsScopeMode === "app-global"}
              onClick={() => onSetModelSettingsScopeMode("app-global")}
            >
              全局
            </button>
            <button
              className={`settings-pill${modelSettingsScopeMode === "per-repo" ? " settings-pill--active" : ""}`}
              type="button"
              aria-pressed={modelSettingsScopeMode === "per-repo"}
              onClick={() => onSetModelSettingsScopeMode("per-repo")}
            >
              按仓库
            </button>
          </div>
        </SettingsRow>
        <SettingsRow title="启用技能斜杠命令" description="让技能类斜杠命令在输入框中保持可用。">
          <input
            aria-label="启用技能斜杠命令"
            checked={runtime?.settings.enableSkillCommands ?? true}
            type="checkbox"
            onChange={(event) => onToggleSkillCommands(event.target.checked)}
          />
        </SettingsRow>
        <SettingsRow title="集成终端 Shell" description="留空时使用系统默认登录 Shell。">
          <input
            aria-label="集成终端 Shell"
            className="settings-text-input"
            placeholder="/bin/zsh"
            spellCheck={false}
            type="text"
            value={terminalShellDraft}
            onBlur={commitTerminalShellDraft}
            onChange={(event) => setTerminalShellDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="快捷键">
        <SettingsInfoRow label="新对话" value="Cmd+Shift+O" />
        <SettingsInfoRow label="打开设置" value="Cmd+," />
        <SettingsInfoRow label="切换终端" value="Cmd+J" />
        <SettingsInfoRow label="新终端标签页" value="Cmd+T" />
        <SettingsInfoRow label="发送消息" value="Enter" />
        <SettingsInfoRow label="换行" value="Shift+Enter" />
      </SettingsGroup>
    </>
  );
}
