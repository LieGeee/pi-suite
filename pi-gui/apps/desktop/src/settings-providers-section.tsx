import { useEffect, useState } from "react";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import { filterProviders, ProviderRow, SettingsGroup } from "./settings-utils";

interface SettingsProvidersSectionProps {
  readonly runtime?: RuntimeSnapshot;
  readonly onLoginProvider: (providerId: string) => void;
  readonly onLogoutProvider: (providerId: string) => void;
  readonly onSetProviderApiKey: (providerId: string, apiKey: string) => Promise<string | undefined>;
  readonly onRemoveProviderApiKey: (providerId: string) => Promise<string | undefined>;
}

export function SettingsProvidersSection({
  runtime,
  onLoginProvider,
  onLogoutProvider,
  onSetProviderApiKey,
  onRemoveProviderApiKey,
}: SettingsProvidersSectionProps) {
  const [providerQuery, setProviderQuery] = useState("");
  const [apiKeyProviderId, setApiKeyProviderId] = useState<string | undefined>();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | undefined>();
  const [apiKeyPending, setApiKeyPending] = useState(false);

  const providers = runtime?.providers ?? [];
  const connectedProviders = providers.filter((p) => p.hasAuth);
  const oauthProviders = providers.filter((p) => p.oauthSupported);
  const filteredProviders = filterProviders(providers, providerQuery);
  const apiKeyProvider = apiKeyProviderId ? providers.find((provider) => provider.id === apiKeyProviderId) : undefined;

  useEffect(() => {
    setApiKeyDraft("");
    setApiKeyError(undefined);
    setApiKeyPending(false);
  }, [apiKeyProviderId]);

  const closeApiKeyDialog = () => {
    if (apiKeyPending) {
      return;
    }
    setApiKeyProviderId(undefined);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyProvider) {
      return;
    }
    setApiKeyPending(true);
    setApiKeyError(undefined);
    const nextError = await onSetProviderApiKey(apiKeyProvider.id, apiKeyDraft.trim());
    if (nextError) {
      setApiKeyPending(false);
      setApiKeyError(nextError);
      return;
    }
    setApiKeyProviderId(undefined);
  };

  const handleRemoveApiKey = async () => {
    if (!apiKeyProvider) {
      return;
    }
    setApiKeyPending(true);
    setApiKeyError(undefined);
    const nextError = await onRemoveProviderApiKey(apiKeyProvider.id);
    if (nextError) {
      setApiKeyPending(false);
      setApiKeyError(nextError);
      return;
    }
    setApiKeyProviderId(undefined);
  };

  return (
    <>
      <SettingsGroup title="已连接" description="已连接的提供商会优先出现在模型选择中。">
        {connectedProviders.length > 0 ? (
          connectedProviders.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onLoginProvider={onLoginProvider}
              onLogoutProvider={onLogoutProvider}
              onConfigureApiKey={(entry) => setApiKeyProviderId(entry.id)}
            />
          ))
        ) : (
          <div className="settings-row">
            <span className="settings-row__description">还没有已连接的提供商。</span>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="登录" description="支持 OAuth 的提供商可以直接在桌面端登录。">
        {oauthProviders.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            onLoginProvider={onLoginProvider}
            onLogoutProvider={onLogoutProvider}
            onConfigureApiKey={(entry) => setApiKeyProviderId(entry.id)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="全部提供商" description="浏览完整的提供商列表。">
        <details className="settings-disclosure">
          <summary className="settings-disclosure__summary">
            <span>浏览全部提供商</span>
            <span>{filteredProviders.length}</span>
          </summary>
          <div className="settings-disclosure__body">
            <input
              aria-label="搜索提供商"
              className="settings-search"
              placeholder="搜索提供商"
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
            />
            <div className="settings-list">
              {filteredProviders.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  onLoginProvider={onLoginProvider}
                  onLogoutProvider={onLogoutProvider}
                  onConfigureApiKey={(entry) => setApiKeyProviderId(entry.id)}
                />
              ))}
            </div>
          </div>
        </details>
      </SettingsGroup>

      {apiKeyProvider ? (
        <ProviderApiKeyDialog
          provider={apiKeyProvider}
          draft={apiKeyDraft}
          error={apiKeyError}
          pending={apiKeyPending}
          onChangeDraft={setApiKeyDraft}
          onClose={closeApiKeyDialog}
          onRemove={apiKeyProvider.authSource === "auth_file" ? handleRemoveApiKey : undefined}
          onSave={handleSaveApiKey}
        />
      ) : null}
    </>
  );
}

function ProviderApiKeyDialog({
  provider,
  draft,
  error,
  pending,
  onChangeDraft,
  onClose,
  onRemove,
  onSave,
}: {
  readonly provider: RuntimeSnapshot["providers"][number];
  readonly draft: string;
  readonly error?: string;
  readonly pending: boolean;
  readonly onChangeDraft: (value: string) => void;
  readonly onClose: () => void;
  readonly onRemove?: () => Promise<void>;
  readonly onSave: () => Promise<void>;
}) {
  const title = provider.authSource === "auth_file" ? "管理 API 密钥" : "设置 API 密钥";
  const body =
    provider.authSource === "auth_file"
      ? `替换或移除 ${provider.name} 已保存的 API 密钥。`
      : `为 ${provider.name} 在本地保存一个 API 密钥。`;

  return (
    <div className="extension-dialog-backdrop">
      <div className="extension-dialog" data-testid="provider-api-key-dialog">
        <div className="extension-dialog__title">{title}</div>
        <p className="extension-dialog__body">{body}</p>
        <input
          aria-label={`${provider.name} API 密钥`}
          autoFocus
          className="settings-search"
          disabled={pending}
          placeholder="输入 API 密钥"
          type="password"
          value={draft}
          onChange={(event) => onChangeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              void onSave();
            }
          }}
        />
        {error ? <p className="extension-dialog__body settings-warning">{error}</p> : null}
        <div className="extension-dialog__actions">
          <button className="button button--secondary" disabled={pending} type="button" onClick={onClose}>
            取消
          </button>
          {onRemove ? (
            <button className="button button--secondary" disabled={pending} type="button" onClick={() => void onRemove()}>
              移除已保存的密钥
            </button>
          ) : null}
          <button
            className="button"
            disabled={pending || draft.trim().length === 0}
            type="button"
            onClick={() => void onSave()}
          >
            {provider.authSource === "auth_file" ? "保存密钥" : "设置 API 密钥"}
          </button>
        </div>
      </div>
    </div>
  );
}
