import { useEffect, useState } from "react";
import type { DifyConfig } from "./desktop-state";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface DifySettingsProps {
  readonly difyConfig?: DifyConfig | null;
  readonly onSaveDifyConfig: (config: DifyConfig) => void;
}

export function DifySettings({ difyConfig, onSaveDifyConfig }: DifySettingsProps) {
  const [serverUrl, setServerUrl] = useState(difyConfig?.serverUrl ?? "");
  const [apiKey, setApiKey] = useState(difyConfig?.apiKey ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Initialize local state from snapshot prop
  useEffect(() => {
    setServerUrl(difyConfig?.serverUrl ?? "");
    setApiKey(difyConfig?.apiKey ?? "");
  }, [difyConfig]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const normalizedUrl = serverUrl.trim().replace(/\/+$/, "");
      const response = await fetch(`${normalizedUrl}/info`, {
        method: "GET",
        headers: apiKey.trim()
          ? { Authorization: `Bearer ${apiKey.trim()}` }
          : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setTestResult(`连接成功: ${JSON.stringify(data)}`);
      } else {
        const body = await response.text().catch(() => "");
        setTestResult(`连接失败: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`);
      }
    } catch (error) {
      setTestResult(`连接错误: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSaveDifyConfig({
      serverUrl: serverUrl.trim(),
      apiKey: apiKey.trim(),
    });
  };

  return (
    <SettingsGroup title="Dify 工作流" description="配置 Dify 工作流服务器地址和 API 密钥。">
      <SettingsRow title="服务器地址" description="Dify 服务器的 URL，例如 https://api.dify.ai/v1">
        <input
          aria-label="Dify 服务器地址"
          className="settings-text-input dify-settings__input"
          placeholder="https://api.dify.ai/v1"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
        />
      </SettingsRow>
      <SettingsRow title="API 密钥" description="在 Dify 后台创建的 API 密钥。">
        <input
          aria-label="Dify API 密钥"
          className="settings-text-input dify-settings__input"
          type="password"
          placeholder="app-xxxxxxxxxxxxxxxx"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </SettingsRow>
      <SettingsRow title="测试连接" description="尝试连接 Dify 服务器并验证 API 密钥。">
        <div className="dify-settings__actions">
          <button
            className="button button--secondary dify-settings__button"
            type="button"
            disabled={testing || !serverUrl.trim()}
            onClick={handleTestConnection}
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
          <button
            className="button button--primary dify-settings__button"
            type="button"
            disabled={!serverUrl.trim() || !apiKey.trim()}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </SettingsRow>
      {testResult ? (
        <SettingsRow title="测试结果">
          <span
            className={`dify-settings__result ${
              testResult.startsWith("连接成功")
                ? "dify-settings__result--success"
                : "dify-settings__result--error"
            }`}
          >
            {testResult}
          </span>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
}
