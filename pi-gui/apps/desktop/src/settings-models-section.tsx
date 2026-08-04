import { useState } from "react";
import type { RuntimeSettingsSnapshot, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  ThirdPartyDiscoveredModel,
  ThirdPartyModelApiType,
  ThirdPartyModelDiscoveryInput,
  ThirdPartyModelProviderInput,
} from "./ipc";
import {
  filterModels,
  labelForThinking,
  settingsPill,
  SettingsGroup,
  SettingsRow,
  THINKING_LEVELS,
} from "./settings-utils";

interface SettingsModelsSectionProps {
  readonly runtime?: RuntimeSnapshot;
  readonly onSetDefaultModel: (provider: string, modelId: string) => void;
  readonly onSetThinkingLevel: (thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"]) => void;
  readonly onSetScopedModelPatterns: (patterns: readonly string[]) => void;
  readonly onDiscoverThirdPartyModels: (input: ThirdPartyModelDiscoveryInput) => Promise<readonly ThirdPartyDiscoveredModel[]>;
  readonly onSaveThirdPartyModelProvider: (input: ThirdPartyModelProviderInput) => Promise<string | undefined>;
}

export function SettingsModelsSection({
  runtime,
  onSetDefaultModel,
  onSetThinkingLevel,
  onSetScopedModelPatterns,
  onDiscoverThirdPartyModels,
  onSaveThirdPartyModelProvider,
}: SettingsModelsSectionProps) {
  const [modelQuery, setModelQuery] = useState("");
  const [scopedQuery, setScopedQuery] = useState("");
  const [quickProviderName, setQuickProviderName] = useState("");
  const [quickProviderId, setQuickProviderId] = useState("");
  const [quickBaseUrl, setQuickBaseUrl] = useState("");
  const [quickApiKey, setQuickApiKey] = useState("");
  const [quickApiType, setQuickApiType] = useState<ThirdPartyModelApiType>("openai-completions");
  const [quickModels, setQuickModels] = useState<readonly ThirdPartyDiscoveredModel[]>([]);
  const [quickSelectedModelIds, setQuickSelectedModelIds] = useState<readonly string[]>([]);
  const [quickPending, setQuickPending] = useState(false);
  const [quickError, setQuickError] = useState<string | undefined>();

  const models = runtime?.models ?? [];
  const availableModels = models.filter((m) => m.available);

  const enabledPatterns = runtime?.settings.enabledModelPatterns ?? [];
  const allImplicitlyEnabled = enabledPatterns.length === 0;

  const activeScopedPatterns = allImplicitlyEnabled
    ? availableModels.map((model) => `${model.providerId}/${model.modelId}`)
    : enabledPatterns;
  const activeScopedSet = new Set(activeScopedPatterns);

  const enabledAvailableModels = availableModels.filter((model) => {
    if (allImplicitlyEnabled) return true;
    return activeScopedSet.has(`${model.providerId}/${model.modelId}`);
  });
  const enabledAvailablePatterns = enabledAvailableModels.map((model) => `${model.providerId}/${model.modelId}`);

  const defaultProvider = runtime?.settings.defaultProvider;
  const defaultModelId = runtime?.settings.defaultModelId;
  const defaultIsEnabled =
    defaultProvider && defaultModelId
      ? enabledAvailableModels.some((m) => m.providerId === defaultProvider && m.modelId === defaultModelId)
      : false;

  const filteredModels = filterModels(models, modelQuery);
  const filteredScopedModels = filterModels(availableModels, scopedQuery);

  const togglePattern = (pattern: string, checked: boolean) => {
    const newPatterns = checked
      ? [...activeScopedPatterns, pattern]
      : activeScopedPatterns.filter((entry) => entry !== pattern);
    if (newPatterns.length === 0) return;
    onSetScopedModelPatterns(newPatterns);
  };

  const handleDiscoverQuickModels = async () => {
    setQuickPending(true);
    setQuickError(undefined);
    try {
      const discovered = await onDiscoverThirdPartyModels({
        baseUrl: quickBaseUrl,
        apiKey: quickApiKey,
        apiType: quickApiType,
      });
      setQuickModels(discovered);
      setQuickSelectedModelIds(discovered.map((model) => model.id));
      if (discovered.length === 0) {
        setQuickError("没有从这个接口发现模型，可以切换 JSON 配置手动添加。");
      }
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : String(error));
    } finally {
      setQuickPending(false);
    }
  };

  const handleSaveQuickProvider = async () => {
    const selectedModels = quickModels.filter((model) => quickSelectedModelIds.includes(model.id));
    setQuickPending(true);
    setQuickError(undefined);
    const error = await onSaveThirdPartyModelProvider({
      providerName: quickProviderName,
      providerId: quickProviderId,
      baseUrl: quickBaseUrl,
      apiKey: quickApiKey,
      apiType: quickApiType,
      selectedModels,
    });
    setQuickPending(false);
    if (error) {
      setQuickError(error);
      return;
    }
    setQuickModels([]);
    setQuickSelectedModelIds([]);
  };

  const toggleQuickModel = (modelId: string, checked: boolean) => {
    setQuickSelectedModelIds((current) =>
      checked ? [...current, modelId] : current.filter((entry) => entry !== modelId),
    );
  };

  const fillOpenRouterPreset = () => {
    setQuickProviderName("OpenRouter");
    setQuickProviderId("openrouter");
    setQuickBaseUrl("https://openrouter.ai/api/v1");
    setQuickApiType("openai-completions");
    setQuickModels([]);
    setQuickSelectedModelIds([]);
    setQuickError(undefined);
  };

  return (
    <>
      <SettingsGroup title="第三方快速配置" description="用表单生成 models.json 第三方模型配置，也可以复制 JSON 后继续高级编辑。">
        <div className="settings-row settings-row--stacked">
          <div className="settings-row__actions settings-row__actions--start">
            <button className="button button--secondary" type="button" onClick={fillOpenRouterPreset}>
              使用 OpenRouter 模板
            </button>
          </div>
          <div className="settings-quick-grid">
            <label className="settings-field">
              <span>提供商名称</span>
              <input
                aria-label="提供商名称"
                className="settings-text-input"
                placeholder="例如 Claude 网关"
                value={quickProviderName}
                onChange={(event) => setQuickProviderName(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>提供商 ID</span>
              <input
                aria-label="提供商 ID"
                className="settings-text-input"
                placeholder="例如 claude-gateway"
                value={quickProviderId}
                onChange={(event) => setQuickProviderId(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>基础 URL</span>
              <input
                aria-label="基础 URL"
                className="settings-text-input"
                placeholder="https://api.example.com/v1"
                value={quickBaseUrl}
                onChange={(event) => setQuickBaseUrl(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>API 密钥</span>
              <input
                aria-label="API 密钥"
                className="settings-text-input"
                placeholder="保存在本机 models.json"
                type="password"
                value={quickApiKey}
                onChange={(event) => setQuickApiKey(event.target.value)}
              />
            </label>
            <label className="settings-field">
              <span>API 类型</span>
              <select
                aria-label="API 类型"
                className="settings-select"
                value={quickApiType}
                onChange={(event) => setQuickApiType(event.target.value as ThirdPartyModelApiType)}
              >
                <option value="openai-completions">OpenAI Chat Completions</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic-messages">Anthropic Messages</option>
                <option value="google-generative-ai">Google Generative AI</option>
              </select>
            </label>
          </div>
          <div className="settings-row__actions settings-row__actions--start">
            <button
              className="button button--secondary"
              disabled={quickPending || !quickBaseUrl.trim() || !quickApiKey.trim()}
              type="button"
              onClick={() => void handleDiscoverQuickModels()}
            >
              获取模型列表
            </button>
            <button
              className="button button--primary"
              disabled={quickPending || quickSelectedModelIds.length === 0 || !quickProviderId.trim() || !quickBaseUrl.trim() || !quickApiKey.trim()}
              type="button"
              onClick={() => void handleSaveQuickProvider()}
            >
              保存第三方模型
            </button>
          </div>
          {quickError ? <p className="settings-warning">{quickError}</p> : null}
          {quickModels.length > 0 ? (
            <div className="settings-list">
              {quickModels.map((model) => (
                <label className="settings-toggle settings-toggle--row" key={model.id}>
                  <input
                    checked={quickSelectedModelIds.includes(model.id)}
                    type="checkbox"
                    onChange={(event) => toggleQuickModel(model.id, event.target.checked)}
                  />
                  <span>
                    <strong>{model.name}</strong>
                    <span className="settings-list__meta"> · {model.id}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <details className="settings-disclosure">
            <summary className="settings-disclosure__summary">
              <span>JSON 配置预览</span>
              <span>{quickApiType}</span>
            </summary>
            <pre className="settings-json-preview">{JSON.stringify({
              providers: {
                [quickProviderId || "my-provider"]: {
                  name: quickProviderName || "我的提供商",
                  baseUrl: quickBaseUrl || "https://api.example.com/v1",
                  api: quickApiType,
                  apiKey: quickApiKey || "YOUR_API_KEY",
                  models: (quickModels.length > 0 ? quickModels : [{ id: "model-id", name: "Model Name" }]).map((model) => ({
                    id: model.id,
                    name: model.name,
                  })),
                },
              },
            }, null, 2)}</pre>
          </details>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow title="默认模型" description="选择新会话默认使用的模型。">
          <select
            aria-label="默认模型"
            className="settings-select"
            value={
              defaultProvider && defaultModelId && defaultIsEnabled
                ? `${defaultProvider}:${defaultModelId}`
                : ""
            }
            onChange={(event) => {
              const [provider, ...modelParts] = event.target.value.split(":");
              const modelId = modelParts.join(":");
              if (provider && modelId) {
                onSetDefaultModel(provider, modelId);
              }
            }}
          >
            <option value="">选择模型</option>
            {enabledAvailableModels.map((model) => (
              <option key={`${model.providerId}:${model.modelId}`} value={`${model.providerId}:${model.modelId}`}>
                {model.providerName} · {model.label}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow title="推理强度" description="设置新会话默认的推理强度。">
          <div className="settings-pill-row">
            {THINKING_LEVELS.map((level) => (
              <button
                className={settingsPill(runtime?.settings.defaultThinkingLevel === level)}
                key={level}
                type="button"
                onClick={() => onSetThinkingLevel(level)}
              >
                {labelForThinking(level)}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="已启用模型" description="选择哪些模型会出现在整个应用的选择器中。">
        <div className="settings-row">
          {enabledAvailablePatterns.length > 0 ? (
            <div className="settings-pill-row">
              {enabledAvailablePatterns.map((pattern) => (
                <span className={settingsPill(true)} key={pattern}>
                  {pattern}
                </span>
              ))}
            </div>
          ) : (
            <span className="settings-hint">
              {availableModels.length === 0
                ? "当前还没有可用的已连接模型。"
                : "当前没有任何已启用的可用模型。"}
            </span>
          )}
        </div>
        {allImplicitlyEnabled && availableModels.length > 0 ? (
          <div className="settings-row">
            <span className="settings-hint">默认会启用所有可用模型。</span>
          </div>
        ) : null}
        {!defaultIsEnabled && defaultProvider && defaultModelId ? (
          <div className="settings-row">
            <span className="settings-warning">
              默认模型 ({defaultProvider}:{defaultModelId}) 当前未启用，请在上方重新选择。
            </span>
          </div>
        ) : null}
        <details className="settings-disclosure">
          <summary className="settings-disclosure__summary">
            <span>编辑已启用模型</span>
            <span>{filteredScopedModels.length}</span>
          </summary>
          <div className="settings-disclosure__body">
            <input
              aria-label="搜索已启用模型"
              className="settings-search"
              placeholder="搜索已启用模型"
              value={scopedQuery}
              onChange={(event) => setScopedQuery(event.target.value)}
            />
            <div className="settings-list">
              {filteredScopedModels.map((model) => {
                const pattern = `${model.providerId}/${model.modelId}`;
                const enabled = activeScopedSet.has(pattern);
                const isLast = enabled && activeScopedPatterns.length <= 1;
                return (
                  <label className="settings-toggle settings-toggle--row" key={pattern}>
                    <input
                      checked={enabled}
                      disabled={isLast}
                      title={isLast ? "至少需要启用一个模型" : undefined}
                      type="checkbox"
                      onChange={(event) => togglePattern(pattern, event.target.checked)}
                    />
                    <span>
                      <strong>{model.providerName}</strong> · {model.label}
                      <span className="settings-list__meta"> · {pattern}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </details>
      </SettingsGroup>

      <SettingsGroup title="全部模型" description="浏览完整模型目录；需要先在上方启用才能使用。">
        <details className="settings-disclosure">
          <summary className="settings-disclosure__summary">
            <span>浏览完整模型目录</span>
            <span>{filteredModels.length}</span>
          </summary>
          <div className="settings-disclosure__body">
            <input
              aria-label="搜索模型"
              className="settings-search"
              placeholder="搜索模型"
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
            />
            <div className="settings-list">
              {filteredModels.map((model) => {
                const pattern = `${model.providerId}/${model.modelId}`;
                const enabled = activeScopedSet.has(pattern);
                const isLast = enabled && activeScopedPatterns.length <= 1;
                return (
                  <div
                    className="settings-option"
                    key={`${model.providerId}:${model.modelId}`}
                  >
                    <span className="settings-option__title">{model.providerName} · {model.label}</span>
                    <span className="settings-option__meta">
                      {model.providerId}:{model.modelId}
                      {model.reasoning ? " · 支持推理" : ""}
                      {model.supportsImages ? " · 支持图片" : ""}
                      {!model.available ? " · 未登录" : ""}
                    </span>
                    {model.available ? (
                      <label className="settings-toggle settings-toggle--inline">
                        <input
                          checked={enabled}
                          disabled={isLast}
                          title={isLast ? "至少需要启用一个模型" : undefined}
                          type="checkbox"
                          onChange={(event) => togglePattern(pattern, event.target.checked)}
                        />
                        <span className="sr-only">启用</span>
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      </SettingsGroup>
    </>
  );
}
