import { useCallback, useRef, useState } from "react";
import type { DevelopmentModePreset } from "./desktop-state";

interface Props {
  readonly appMode: "chat" | "development";
  readonly developmentModePresets: readonly DevelopmentModePreset[];
  readonly activeDevelopmentModePresetId: string | null;
  readonly onSetAppMode: (mode: "chat" | "development") => void;
  readonly onSetActiveDevelopmentModePresetId: (id: string | null) => void;
  readonly onOpenDevelopmentSettings: () => void;
}

export function ComposerModeSelector({
  appMode,
  developmentModePresets,
  activeDevelopmentModePresetId,
  onSetAppMode,
  onSetActiveDevelopmentModePresetId,
  onOpenDevelopmentSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const activePreset = developmentModePresets.find((p) => p.id === activeDevelopmentModePresetId);
  const label = appMode === "development" && activePreset
    ? `🤖 ${activePreset.name}`
    : "💬 对话";

  return (
    <span className="composer-mode-selector" ref={containerRef}>
      <span className="composer-mode-selector__anchor">
        <button
          className="composer-mode-selector__badge"
          type="button"
          onClick={toggle}
          onBlur={() => setTimeout(close, 200)}
        >
          {label}
          <span className="composer-mode-selector__arrow">{open ? "▲" : "▼"}</span>
        </button>
        {open ? (
          <span className="composer-mode-selector__dropdown">
            <button
              className="composer-mode-selector__item"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSetAppMode("chat"); close(); }}
            >
              💬 对话
              {appMode === "chat" ? <span className="composer-mode-selector__check"> ✓</span> : null}
            </button>

            {developmentModePresets.length === 0 ? (
              <button
                className="composer-mode-selector__item composer-mode-selector__item--disabled"
                type="button"
                disabled
              >
                🤖 开发（暂无方案）
              </button>
            ) : null}

            {developmentModePresets.map((preset) => (
              <button
                key={preset.id}
                className="composer-mode-selector__item"
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSetActiveDevelopmentModePresetId(preset.id); onSetAppMode("development"); close(); }}
              >
                🤖 {preset.name}
                {preset.id === activeDevelopmentModePresetId && appMode === "development"
                  ? <span className="composer-mode-selector__check"> ✓</span>
                  : null}
              </button>
            ))}

            <div className="composer-mode-selector__divider" />

            <button
              className="composer-mode-selector__item composer-mode-selector__item--settings"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); close(); onOpenDevelopmentSettings(); }}
            >
              ⚙️ 配置开发方案
            </button>
          </span>
        ) : null}
      </span>
    </span>
  );
}
