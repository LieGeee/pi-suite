import type { RuntimeSettingsSnapshot, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  AppearanceThemeId,
  AppearanceThemeRecord,
  DifyConfig,
  MobileSyncSettings,
  ModelSettingsScopeMode,
  NotificationPreferences,
  WorkspaceRecord,
} from "./desktop-state";
import type {
  DesktopComputerUsePrivacyPane,
  DesktopComputerUseStatus,
  DesktopNotificationPermissionStatus,
  ThirdPartyDiscoveredModel,
  ThirdPartyModelDiscoveryInput,
  ThirdPartyModelProviderInput,
} from "./ipc";
import { SettingsAppearanceSection } from "./settings-appearance-section";
import { SettingsComputerUseSection } from "./settings-computer-use-section";
import { SettingsGeneralSection } from "./settings-general-section";
import { SettingsModelsSection } from "./settings-models-section";
import { SettingsNotificationsSection } from "./settings-notifications-section";
import { SettingsProvidersSection } from "./settings-providers-section";
import { SettingsMobileSyncSection } from "./settings-mobile-sync-section";
import { SettingsDevelopmentSection } from "./settings-development-section";
import { DifySettings } from "./settings-dify-section";
import { type SettingsSection, sectionTitle, sectionDescription } from "./settings-utils";

export type { SettingsSection } from "./settings-utils";

interface SettingsViewProps {
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly section: SettingsSection;
  readonly notificationPreferences: NotificationPreferences;
  readonly mobileSync: MobileSyncSettings;
  readonly notificationPermissionStatus: DesktopNotificationPermissionStatus;
  readonly notificationPermissionPending: boolean;
  readonly computerUseStatus?: DesktopComputerUseStatus;
  readonly computerUseStatusPending: boolean;
  readonly modelSettingsScopeMode: ModelSettingsScopeMode;
  readonly integratedTerminalShell: string;
  readonly appearanceTheme: AppearanceThemeId;
  readonly appearanceThemes: readonly AppearanceThemeRecord[];
  readonly themeMode: "system" | "light" | "dark";
  readonly enableTransparency: boolean;
  readonly onSetModelSettingsScopeMode: (mode: ModelSettingsScopeMode) => void;
  readonly onSetDefaultModel: (provider: string, modelId: string) => void;
  readonly onSetThinkingLevel: (thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"]) => void;
  readonly onDiscoverThirdPartyModels: (input: ThirdPartyModelDiscoveryInput) => Promise<readonly ThirdPartyDiscoveredModel[]>;
  readonly onSaveThirdPartyModelProvider: (input: ThirdPartyModelProviderInput) => Promise<string | undefined>;
  readonly onToggleSkillCommands: (enabled: boolean) => void;
  readonly onSetScopedModelPatterns: (patterns: readonly string[]) => void;
  readonly onLoginProvider: (providerId: string) => void;
  readonly onLogoutProvider: (providerId: string) => void;
  readonly onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<string | undefined>;
  readonly onRemoveProviderApiKey: (providerId: string) => Promise<string | undefined>;
  readonly onSetNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void;
  readonly onSetMobileSyncSettings: (settings: MobileSyncSettings) => void;
  readonly onGenerateMobileSyncPairQrCode?: (relayUrl: string) => Promise<{ pairToken: string; qrImage: string; qrData: string }>;
  readonly onSetIntegratedTerminalShell: (shellPath: string) => void;
  readonly onRequestNotificationPermission: () => void;
  readonly onOpenSystemNotificationSettings: () => void;
  readonly onRefreshComputerUseStatus: () => void;
  readonly onSetLockedComputerUseEnabled: (enabled: boolean) => void;
  readonly onOpenComputerUsePrivacySettings: (pane: DesktopComputerUsePrivacyPane) => void;
  readonly onSetAppearanceTheme: (theme: AppearanceThemeId) => void;
  readonly onSetThemeMode: (mode: "system" | "light" | "dark") => void;
  readonly onSetEnableTransparency: (enabled: boolean) => void;
  readonly appMode: "chat" | "development";
  readonly developmentModePresets: readonly import("./desktop-state").DevelopmentModePreset[];
  readonly activeDevelopmentModePresetId: string | null;
  readonly onSetDevelopmentModePresets: (presets: readonly import("./desktop-state").DevelopmentModePreset[]) => void;
  readonly onSetActiveDevelopmentModePresetId: (id: string | null) => void;
  readonly onSetAppMode: (mode: "chat" | "development") => void;
  readonly difyConfig?: DifyConfig | null;
  readonly onSaveDifyConfig: (config: DifyConfig) => void;
}

export function SettingsView({
  workspace,
  runtime,
  section,
  notificationPreferences,
  mobileSync,
  notificationPermissionStatus,
  notificationPermissionPending,
  computerUseStatus,
  computerUseStatusPending,
  modelSettingsScopeMode,
  integratedTerminalShell,
  appearanceTheme,
  appearanceThemes,
  themeMode,
  enableTransparency,
  onSetModelSettingsScopeMode,
  onSetDefaultModel,
  onSetThinkingLevel,
  onDiscoverThirdPartyModels,
  onSaveThirdPartyModelProvider,
  onToggleSkillCommands,
  onSetScopedModelPatterns,
  onLoginProvider,
  onLogoutProvider,
  onSetProviderApiKey,
  onRemoveProviderApiKey,
  onSetNotificationPreferences,
  onSetMobileSyncSettings,
  onGenerateMobileSyncPairQrCode,
  onSetIntegratedTerminalShell,
  onRequestNotificationPermission,
  onOpenSystemNotificationSettings,
  onRefreshComputerUseStatus,
  onSetLockedComputerUseEnabled,
  onOpenComputerUsePrivacySettings,
  onSetAppearanceTheme,
  onSetThemeMode,
  onSetEnableTransparency,
  appMode,
  developmentModePresets,
  activeDevelopmentModePresetId,
  onSetDevelopmentModePresets,
  onSetActiveDevelopmentModePresetId,
  onSetAppMode,
  difyConfig,
  onSaveDifyConfig,
}: SettingsViewProps) {
  if (
    !workspace &&
    section !== "general" &&
    section !== "notifications" &&
    section !== "appearance" &&
    section !== "computer-use" &&
    section !== "development" &&
    section !== "mobile-sync" &&
    section !== "dify"
  ) {
    return (
      <section className="canvas canvas--empty">
        <div className="empty-panel">
          <div className="session-header__eyebrow">设置</div>
          <h1>请选择一个工作区</h1>
          <p>提供商、模型和技能设置都需要先选定工作区。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="canvas" data-testid="settings-surface">
      <div className="conversation settings-view">
        <header className="view-header">
          <div>
            <div className="chat-header__eyebrow">设置</div>
            <h1 className="view-header__title">{sectionTitle(section)}</h1>
            <p className="view-header__body">
              {sectionDescription(section, workspace?.name ?? "当前工作区")}
            </p>
          </div>
        </header>

        <div className="settings-grid">
          {section === "appearance" ? (
            <SettingsAppearanceSection
              appearanceTheme={appearanceTheme}
              appearanceThemes={appearanceThemes}
              themeMode={themeMode}
              onSetAppearanceTheme={onSetAppearanceTheme}
              onSetThemeMode={onSetThemeMode}
              enableTransparency={enableTransparency}
              onSetEnableTransparency={onSetEnableTransparency}
            />
          ) : null}

          {section === "general" ? (
            <SettingsGeneralSection
              runtime={runtime}
              modelSettingsScopeMode={modelSettingsScopeMode}
              integratedTerminalShell={integratedTerminalShell}
              onSetModelSettingsScopeMode={onSetModelSettingsScopeMode}
              onSetIntegratedTerminalShell={onSetIntegratedTerminalShell}
              onToggleSkillCommands={onToggleSkillCommands}
            />
          ) : null}

          {section === "providers" ? (
            <SettingsProvidersSection
              runtime={runtime}
              onLoginProvider={onLoginProvider}
              onLogoutProvider={onLogoutProvider}
              onSetProviderApiKey={onSetProviderApiKey}
              onRemoveProviderApiKey={onRemoveProviderApiKey}
            />
          ) : null}

          {section === "models" ? (
            <SettingsModelsSection
              runtime={runtime}
              onSetDefaultModel={onSetDefaultModel}
              onSetScopedModelPatterns={onSetScopedModelPatterns}
              onSetThinkingLevel={onSetThinkingLevel}
              onDiscoverThirdPartyModels={onDiscoverThirdPartyModels}
              onSaveThirdPartyModelProvider={onSaveThirdPartyModelProvider}
            />
          ) : null}

          {section === "development" ? (
            <SettingsDevelopmentSection
              runtime={runtime}
              developmentModePresets={developmentModePresets}
              activeDevelopmentModePresetId={activeDevelopmentModePresetId}
              appMode={appMode}
              onSetDevelopmentModePresets={onSetDevelopmentModePresets}
              onSetActiveDevelopmentModePresetId={onSetActiveDevelopmentModePresetId}
              onSetAppMode={onSetAppMode}
            />
          ) : null}

          {section === "computer-use" ? (
            <SettingsComputerUseSection
              status={computerUseStatus}
              pending={computerUseStatusPending}
              onRefresh={onRefreshComputerUseStatus}
              onSetLockedUseEnabled={onSetLockedComputerUseEnabled}
              onOpenPrivacySettings={onOpenComputerUsePrivacySettings}
            />
          ) : null}

          {section === "notifications" ? (
            <SettingsNotificationsSection
              notificationPreferences={notificationPreferences}
              notificationPermissionStatus={notificationPermissionStatus}
              notificationPermissionPending={notificationPermissionPending}
              onSetNotificationPreferences={onSetNotificationPreferences}
              onRequestNotificationPermission={onRequestNotificationPermission}
              onOpenSystemNotificationSettings={onOpenSystemNotificationSettings}
            />
          ) : null}

          {section === "mobile-sync" ? (
            <SettingsMobileSyncSection
              mobileSync={mobileSync}
              onSetMobileSyncSettings={onSetMobileSyncSettings}
              onGenerateMobileSyncPairQrCode={onGenerateMobileSyncPairQrCode}
            />
          ) : null}

          {section === "dify" ? (
            <DifySettings
              difyConfig={difyConfig}
              onSaveDifyConfig={onSaveDifyConfig}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
