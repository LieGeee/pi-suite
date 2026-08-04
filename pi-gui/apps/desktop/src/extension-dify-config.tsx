import { useEffect, useState } from "react";
import type { DifyConfig } from "./desktop-state";

interface ExtensionDifyConfigProps {
  readonly difyConfig?: DifyConfig | null;
  readonly onSaveDifyConfig: (config: DifyConfig) => void;
}

export function ExtensionDifyConfig({ difyConfig, onSaveDifyConfig }: ExtensionDifyConfigProps) {
  const [serverUrl, setServerUrl] = useState(difyConfig?.serverUrl ?? "");
  const [apiKey, setApiKey] = useState(difyConfig?.apiKey ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

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
    <section className="extension-config-panel">
      <div className="skill-detail__header">
        <div>
          <h2>Dify 工作流配置</h2>
          <div className="skill-detail__slash">配置 Dify 服务器地址和 API Key，供 /dify 命令和 agent 工具使用。</div>
        </div>
        <span className={`skill-detail__status ${difyConfig?.serverUrl ? "skill-detail__status--enabled" : ""}`}>
          {difyConfig?.serverUrl ? "已配置" : "未配置"}
        </span>
      </div>

      <div className="settings-quick-grid">
        <label className="settings-field settings-field--wide">
          <span>服务器地址</span>
          <input
            aria-label="Dify 服务器地址"
            className="settings-text-input"
            placeholder="https://api.dify.ai/v1"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </label>
        <label className="settings-field settings-field--wide">
          <span>API Key</span>
          <input
            aria-label="Dify API 密钥"
            className="settings-text-input"
            type="password"
            placeholder="app-xxxxxxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
      </div>

      <div className="skill-detail__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={testing || !serverUrl.trim()}
          onClick={handleTestConnection}
        >
          {testing ? "测试中..." : "测试连接"}
        </button>
        <button
          className="button button--primary"
          type="button"
          disabled={!serverUrl.trim() || !apiKey.trim()}
          onClick={handleSave}
        >
          保存
        </button>
      </div>

      {testResult ? (
        <div className={`settings-warning ${testResult.startsWith("连接成功") ? "settings-warning--success" : ""}`}>
          {testResult}
        </div>
      ) : null}
    </section>
  );
}
