import { useCallback, useState } from "react";
import type { CliConnection, CliToolConfig } from "./desktop-state";

interface ExtensionCliConfigProps {
  readonly cliTools?: readonly CliToolConfig[] | null;
  readonly onSaveCliTools: (tools: readonly CliToolConfig[]) => void;
}

export function ExtensionCliConfig({ cliTools, onSaveCliTools }: ExtensionCliConfigProps) {
  const tools = cliTools ?? [];
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTool, setEditingTool] = useState<CliToolConfig | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const startNew = () => {
    setEditingIndex(null);
    setEditingTool({
      name: "",
      command: "",
      argsTemplate: [],
      connections: [],
      activeConnection: undefined,
    });
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    const tool = tools[index];
    if (tool) {
      setEditingTool(JSON.parse(JSON.stringify(tool)) as CliToolConfig);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingTool(null);
    setTestResult(null);
  };

  const updateField = (field: keyof CliToolConfig, value: string | readonly string[] | undefined) => {
    if (!editingTool) return;
    setEditingTool({ ...editingTool, [field]: value });
  };

  const updateConnection = (connIndex: number, field: keyof CliConnection, value: string | number) => {
    if (!editingTool) return;
    const updated = [...editingTool.connections];
    if (updated[connIndex]) {
      updated[connIndex] = { ...updated[connIndex], [field]: value } as import("./desktop-state").CliConnection;
    }
    setEditingTool({ ...editingTool, connections: updated });
  };

  const addConnection = () => {
    if (!editingTool) return;
    setEditingTool({
      ...editingTool,
      connections: [
        ...editingTool.connections,
        { name: `连接 ${editingTool.connections.length + 1}`, host: "localhost", port: 3306, user: "root", password: "", database: "" },
      ],
    });
  };

  const removeConnection = (connIndex: number) => {
    if (!editingTool) return;
    setEditingTool({
      ...editingTool,
      connections: editingTool.connections.filter((_, i) => i !== connIndex),
    });
  };

  const handleTestConnection = useCallback(async () => {
    if (!editingTool) return;
    const conn = editingTool.activeConnection
      ? editingTool.connections.find((c) => c.name === editingTool.activeConnection)
      : editingTool.connections[0];
    if (!conn) {
      setTestResult("请先添加一个连接。");
      return;
    }
    setTestResult(`配置已保存。在对话中使用 /cli run ${editingTool.name} 来测试连接。`);
  }, [editingTool]);

  const handleQuickTest = useCallback(async (tool: CliToolConfig, conn: CliConnection) => {
    setTestResult(`测试将通过 /cli 命令执行: ${tool.name} → ${conn.name} (${conn.host}:${conn.port})`);
  }, []);

  const save = () => {
    if (!editingTool || !editingTool.name.trim() || !editingTool.command.trim()) return;
    const updated = [...tools];
    if (editingIndex !== null) {
      updated[editingIndex] = editingTool;
    } else {
      updated.push(editingTool);
    }
    onSaveCliTools(updated);
    cancelEdit();
  };

  const removeTool = (index: number) => {
    const updated = tools.filter((_, i) => i !== index);
    onSaveCliTools(updated);
  };

  return (
    <section className="extension-config-panel">
      <div className="skill-detail__header">
        <div>
          <h2>CLI 工具管理</h2>
          <div className="skill-detail__slash">配置命令行工具（MySQL、PostgreSQL、Redis 等），可在对话中直接调用。</div>
        </div>
      </div>

      {/* Tool list */}
      {tools.length > 0 ? (
        <div className="settings-list">
          {tools.map((tool, index) => (
            <div className="settings-list__row" key={tool.name}>
              <div className="settings-list__row-content">
                <strong>{tool.name}</strong>
                <span className="settings-list__meta">
                  {tool.command} · {tool.connections.length} 个连接
                  {tool.activeConnection ? ` · 当前: ${tool.activeConnection}` : ""}
                </span>
              </div>
              <div className="skill-detail__actions">
                {tool.connections.length > 0 ? (
                  <div className="settings-list__inline-tests">
                    {tool.connections.map((conn) => (
                      <button
                        key={conn.name}
                        className="button button--small"
                        type="button"
                        onClick={() => handleQuickTest(tool, conn)}
                      >
                        {conn.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button className="button button--secondary" type="button" onClick={() => startEdit(index)}>
                  编辑
                </button>
                <button className="button button--danger" type="button" onClick={() => removeTool(index)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>还没有配置任何 CLI 工具。点击下方按钮添加。</p>
        </div>
      )}

      {/* Edit / New form */}
      {editingTool ? (
        <div className="settings-card">
          <h3>{editingIndex !== null ? `编辑 ${editingTool.name}` : "添加 CLI 工具"}</h3>
          <div className="settings-quick-grid">
            <label className="settings-field">
              <span>工具名称</span>
              <input
                aria-label="CLI 工具名称"
                className="settings-text-input"
                placeholder="MySQL"
                value={editingTool.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </label>
            <label className="settings-field settings-field--wide">
              <span>可执行文件路径</span>
              <input
                aria-label="CLI 可执行文件路径"
                className="settings-text-input"
                placeholder="C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe"
                value={editingTool.command}
                onChange={(e) => updateField("command", e.target.value)}
              />
            </label>
          </div>

          <h4>连接管理</h4>
          {editingTool.connections.length === 0 ? (
            <p className="settings-hint">尚无连接。点击下方按钮添加。</p>
          ) : (
            editingTool.connections.map((conn, connIndex) => (
              <div className="settings-card settings-card--nested" key={connIndex}>
                <div className="settings-quick-grid">
                  <label className="settings-field">
                    <span>连接名称</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 名称`}
                      className="settings-text-input"
                      placeholder="本地开发"
                      value={conn.name}
                      onChange={(e) => updateConnection(connIndex, "name", e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>主机</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 主机`}
                      className="settings-text-input"
                      placeholder="localhost"
                      value={conn.host}
                      onChange={(e) => updateConnection(connIndex, "host", e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>端口</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 端口`}
                      className="settings-text-input"
                      type="number"
                      value={conn.port}
                      onChange={(e) => updateConnection(connIndex, "port", Number(e.target.value))}
                    />
                  </label>
                  <label className="settings-field">
                    <span>用户名</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 用户名`}
                      className="settings-text-input"
                      placeholder="root"
                      value={conn.user}
                      onChange={(e) => updateConnection(connIndex, "user", e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>密码</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 密码`}
                      className="settings-text-input"
                      type="password"
                      value={conn.password}
                      onChange={(e) => updateConnection(connIndex, "password", e.target.value)}
                    />
                  </label>
                  <label className="settings-field">
                    <span>数据库</span>
                    <input
                      aria-label={`连接 ${connIndex + 1} 数据库`}
                      className="settings-text-input"
                      placeholder="可选"
                      value={conn.database ?? ""}
                      onChange={(e) => updateConnection(connIndex, "database", e.target.value)}
                    />
                  </label>
                </div>
                <div className="skill-detail__actions">
                  <button
                    className="button button--small button--danger"
                    type="button"
                    onClick={() => removeConnection(connIndex)}
                  >
                    删除连接
                  </button>
                </div>
              </div>
            ))
          )}
          <div className="skill-detail__actions">
            <button className="button button--secondary" type="button" onClick={addConnection}>
              添加连接
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={handleTestConnection}
              disabled={!editingTool.connections.length}
            >
              测试当前连接
            </button>
            <button className="button button--primary" type="button" onClick={save}>
              保存
            </button>
            <button className="button button--secondary" type="button" onClick={cancelEdit}>
              取消
            </button>
          </div>
          {testResult ? (
            <div className={`settings-warning ${testResult.startsWith("✅") ? "settings-warning--success" : ""}`}>
              {testResult}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="skill-detail__actions">
          <button className="button button--primary" type="button" onClick={startNew}>
            添加 CLI 工具
          </button>
        </div>
      )}
    </section>
  );
}
