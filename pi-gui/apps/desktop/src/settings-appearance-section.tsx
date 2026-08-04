import type { AppearanceThemeId, AppearanceThemeRecord, ThemeMode } from "./desktop-state";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface SettingsAppearanceSectionProps {
  readonly appearanceTheme: AppearanceThemeId;
  readonly appearanceThemes: readonly AppearanceThemeRecord[];
  readonly themeMode: ThemeMode;
  readonly onSetAppearanceTheme: (theme: AppearanceThemeId) => void;
  readonly onSetThemeMode: (mode: ThemeMode) => void;
  readonly enableTransparency: boolean;
  readonly onSetEnableTransparency: (enabled: boolean) => void;
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; description: string }[] = [
  { mode: "system", label: "跟随系统", description: "跟随操作系统的外观设置" },
  { mode: "light", label: "浅色", description: "始终使用浅色主题" },
  { mode: "dark", label: "深色", description: "始终使用深色主题" },
];

export function SettingsAppearanceSection({
  appearanceTheme,
  appearanceThemes,
  themeMode,
  onSetAppearanceTheme,
  onSetThemeMode,
  enableTransparency,
  onSetEnableTransparency,
}: SettingsAppearanceSectionProps) {
  return (
    <>
      <SettingsGroup title="外观主题" description="三套主题共用同一布局，只改变颜色、图片、圆角和装饰。">
        {appearanceThemes.map((option) => (
          <SettingsRow key={option.id} title={option.name} description={option.description}>
            <input
              aria-label={option.name}
              checked={appearanceTheme === option.id}
              name="appearance-theme"
              type="radio"
              onChange={() => onSetAppearanceTheme(option.id)}
            />
          </SettingsRow>
        ))}
      </SettingsGroup>

      {appearanceTheme === "pi-native" ? (
        <SettingsGroup title="Pi 原生明暗模式">
          {THEME_OPTIONS.map((option) => (
            <SettingsRow key={option.mode} title={option.label} description={option.description}>
              <input
                aria-label={option.label}
                checked={themeMode === option.mode}
                name="theme-mode"
                type="radio"
                onChange={() => onSetThemeMode(option.mode)}
              />
            </SettingsRow>
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="视觉效果">
        <SettingsRow
          title="窗口透明效果"
          description="让支持的界面区域透出桌面背景颜色。"
        >
          <input
            aria-label="窗口透明效果"
            type="checkbox"
            checked={enableTransparency}
            onChange={(event) => onSetEnableTransparency(event.currentTarget.checked)}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
