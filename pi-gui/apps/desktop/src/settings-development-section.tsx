import { useCallback, useMemo, useState } from "react";
import type { DevelopmentModePreset } from "./desktop-state";
import type { DevelopmentSubagentConfig } from "@pi-gui/pi-sdk-driver";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import { buildDevelopmentWorkflowGraph, buildDevelopmentWorkflowModel } from "./development-workflow-graph";

interface Props {
  readonly runtime: RuntimeSnapshot | undefined;
  readonly developmentModePresets: readonly DevelopmentModePreset[];
  readonly activeDevelopmentModePresetId: string | null;
  readonly appMode: "chat" | "development";
  readonly onSetDevelopmentModePresets: (presets: readonly DevelopmentModePreset[]) => void;
  readonly onSetActiveDevelopmentModePresetId: (id: string | null) => void;
  readonly onSetAppMode: (mode: "chat" | "development") => void;
}

const PERMISSION_OPTIONS: DevelopmentSubagentConfig["permission"][] = ["read", "exec", "write"];
const THINKING_OPTIONS = ["low", "medium", "high", "xhigh"];
const WORKFLOW_OPTIONS: readonly { readonly value: NonNullable<DevelopmentModePreset["config"]["workflow"]>; readonly label: string }[] = [
  { value: "manual", label: "手动编排" },
  { value: "parallel-development", label: "并行开发" },
  { value: "proposal-review", label: "方案评审" },
  { value: "code-review", label: "代码审查" },
  { value: "test-fix", label: "测试修复" },
];
const ROLE_OPTIONS: readonly { readonly value: NonNullable<DevelopmentSubagentConfig["role"]>; readonly label: string; readonly permission: DevelopmentSubagentConfig["permission"]; readonly color: string }[] = [
  { value: "architect", label: "架构师", permission: "read", color: "#7c3aed" },
  { value: "developer", label: "开发者", permission: "write", color: "#2563eb" },
  { value: "tester", label: "测试员", permission: "exec", color: "#059669" },
  { value: "reviewer", label: "审查者", permission: "read", color: "#d97706" },
  { value: "fixer", label: "修复者", permission: "write", color: "#dc2626" },
  { value: "observer", label: "观察员", permission: "read", color: "#6b7280" },
];

function newSubagent(role: NonNullable<DevelopmentSubagentConfig["role"]> = "reviewer"): DevelopmentSubagentConfig {
  const roleOption = ROLE_OPTIONS.find((entry) => entry.value === role) ?? ROLE_OPTIONS.find((entry) => entry.value === "reviewer");
  return {
    id: `agent-${Date.now().toString(36)}`,
    name: roleOption?.label ?? "Reviewer",
    role,
    enabled: true,
    model: { provider: "", modelId: "", thinkingLevel: "medium" },
    permission: roleOption?.permission ?? "read",
    trigger: role === "tester" ? "test-failure" : "manual",
  };
}

function newPreset(): DevelopmentModePreset {
  return {
    id: `preset-${Date.now().toString(36)}`,
    name: "",
    config: {
      workflow: "manual",
      environment: "local",
      subagentLaunchPolicy: "first-message",
      mainAgent: { provider: "", modelId: "", thinkingLevel: "medium" },
      documentContext: {
        enabled: false,
        paths: [],
        shareWithSubagents: true,
      },
      toolContext: {
        enabled: true,
        enabledExtensionPaths: [],
      },
      subagents: [],
    },
  };
}

export function SettingsDevelopmentSection({
  runtime,
  developmentModePresets,
  activeDevelopmentModePresetId,
  appMode,
  onSetDevelopmentModePresets,
  onSetActiveDevelopmentModePresetId,
  onSetAppMode,
}: Props) {
  const [editPreset, setEditPreset] = useState<DevelopmentModePreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [configView, setConfigView] = useState<"simple" | "orchestration">("simple");

  const providerOptions = useMemo(() => {
    if (!runtime?.providers) return [];
    return runtime.providers
      .filter((p) => p.hasAuth)
      .map((p) => p.id);
  }, [runtime]);

  const modelOptionsForProvider = useCallback((providerId: string) => {
    if (!runtime?.models) return [];
    return runtime.models
      .filter((m) => m.providerId === providerId)
      .map((m) => ({
        providerId: m.providerId,
        modelId: m.modelId,
        label: m.label || m.modelId,
      }));
  }, [runtime]);

  const toolExtensions = useMemo(() => (runtime?.extensions ?? [])
    .filter((extension) => extension.enabled && extension.tools.length > 0)
    .map((extension) => ({
      path: extension.path,
      label: extension.displayName,
      tools: extension.tools,
    })), [runtime]);

  const handleSave = useCallback(() => {
    if (!editPreset || !editPreset.name.trim()) return;
    const presetToSave: DevelopmentModePreset = {
      ...editPreset,
      config: {
        ...editPreset.config,
        graph: buildDevelopmentWorkflowGraph(editPreset.config),
      },
    };
    const existingIndex = developmentModePresets.findIndex((p) => p.id === editPreset.id);
    let next: readonly DevelopmentModePreset[];
    if (existingIndex >= 0) {
      next = developmentModePresets.map((p, i) => (i === existingIndex ? presetToSave : p));
    } else {
      next = [...developmentModePresets, presetToSave];
    }
    onSetDevelopmentModePresets(next);
    setEditPreset(null);
    setIsCreating(false);
  }, [editPreset, developmentModePresets, onSetDevelopmentModePresets]);

  const handleDelete = useCallback((id: string) => {
    onSetDevelopmentModePresets(developmentModePresets.filter((p) => p.id !== id));
    if (activeDevelopmentModePresetId === id) {
      onSetActiveDevelopmentModePresetId(null);
    }
  }, [developmentModePresets, activeDevelopmentModePresetId, onSetDevelopmentModePresets, onSetActiveDevelopmentModePresetId]);

  const handleUse = useCallback((id: string) => {
    onSetActiveDevelopmentModePresetId(id);
    onSetAppMode("development");
  }, [onSetActiveDevelopmentModePresetId, onSetAppMode]);

  const activePreset = developmentModePresets.find((p) => p.id === activeDevelopmentModePresetId);
  const editWorkflowModel = useMemo(() => editPreset ? buildDevelopmentWorkflowModel(editPreset.config) : null, [editPreset]);
  const editGraph = editWorkflowModel?.active ?? null;
  const editConfiguredRoles = useMemo(() => new Set(editPreset?.config.subagents.filter((agent) => agent.enabled !== false).map((agent) => agent.role).filter(Boolean) ?? []), [editPreset]);

  return (
    <div className="settings-section">
      <h3 className="settings-section__title">开发模式</h3>
      <p className="settings-section__description">
        配置多个开发模式方案，每个方案包含主 Agent 和若干子 Agent。发送消息时自动按配置分发任务。
      </p>

      {/* Current mode toggle */}
      <div className="settings-row">
        <div className="settings-row__label">
          <div className="settings-row__title">当前模式</div>
          <div className="settings-row__description">
            {appMode === "development" && activePreset
              ? `开发模式 · ${activePreset.name}`
              : "普通对话模式"}
          </div>
        </div>
        <div className="settings-row__control">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onSetAppMode(appMode === "development" ? "chat" : "development")}
          >
            {appMode === "development" ? "切换到普通对话" : "切换到开发模式"}
          </button>
        </div>
      </div>

      {/* Presets list */}
      {developmentModePresets.length === 0 && !isCreating ? (
        <div className="settings-row">
          <div className="settings-row__label">
            <div className="settings-row__title">尚无方案</div>
            <div className="settings-row__description">点击下方按钮创建第一个开发模式方案。</div>
          </div>
        </div>
      ) : null}

      {developmentModePresets.map((preset) => (
        <div className="settings-row" key={preset.id}>
          <div className="settings-row__label">
            <div className="settings-row__title">
              {preset.name}
              {preset.id === activeDevelopmentModePresetId ? (
                <span className="settings-badge" style={{ marginLeft: 8 }}>使用中</span>
              ) : null}
            </div>
            <div className="settings-row__description">
              {(preset.config.environment ?? "local") === "worktree" ? "工作树" : "本地"}
              {" · "}
              主 Agent: {preset.config.mainAgent.provider}:{preset.config.mainAgent.modelId || "未配置"}
              {" · "}
              {preset.config.subagents.filter((agent) => agent.enabled !== false).length}/{preset.config.subagents.length} 个子 Agent 使用中
            </div>
          </div>
          <div className="settings-row__control" style={{ display: "flex", gap: 4 }}>
            {preset.id !== activeDevelopmentModePresetId ? (
              <button className="button button--primary" type="button" onClick={() => handleUse(preset.id)}>
                使用
              </button>
            ) : null}
            <button className="button button--secondary" type="button" onClick={() => { setEditPreset(preset); setIsCreating(false); }}>
              编辑
            </button>
            <button className="button button--secondary" type="button" onClick={() => handleDelete(preset.id)}>
              删除
            </button>
          </div>
        </div>
      ))}

      {!isCreating && !editPreset ? (
        <div className="settings-actions">
          <button className="button button--primary" type="button" onClick={() => { setEditPreset(newPreset()); setIsCreating(true); }}>
            + 新建方案
          </button>
        </div>
      ) : null}

      {/* Create/Edit form */}
      {editPreset ? (
        <div className="settings-section" style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px" }}>{isCreating ? "新建方案" : "编辑方案"}</h4>

          <label className="settings-field" style={{ marginBottom: 8 }}>
            <span>方案名称</span>
            <input
              className="settings-text-input"
              value={editPreset.name}
              onChange={(e) => setEditPreset({ ...editPreset, name: e.target.value })}
              placeholder="如：全面检查、前端项目"
            />
          </label>

          <div className="settings-quick-grid" style={{ marginBottom: 8 }}>
            <label className="settings-field">
              <span>工作流模板</span>
              <select
                className="settings-select"
                value={editPreset.config.workflow ?? "manual"}
                onChange={(e) => setEditPreset({
                  ...editPreset,
                  config: { ...editPreset.config, workflow: e.target.value as NonNullable<DevelopmentModePreset["config"]["workflow"]> },
                })}
              >
                {WORKFLOW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>运行环境</span>
              <select
                className="settings-select"
                value={editPreset.config.environment ?? "local"}
                onChange={(e) => setEditPreset({
                  ...editPreset,
                  config: { ...editPreset.config, environment: e.target.value === "worktree" ? "worktree" : "local" },
                })}
              >
                <option value="local">本地当前工作区</option>
                <option value="worktree">工作树沙箱</option>
              </select>
            </label>
            <label className="settings-field">
              <span>子 Agent 启动</span>
              <select
                className="settings-select"
                value={editPreset.config.subagentLaunchPolicy ?? "first-message"}
                onChange={(e) => setEditPreset({
                  ...editPreset,
                  config: {
                    ...editPreset.config,
                    subagentLaunchPolicy: e.target.value as NonNullable<DevelopmentModePreset["config"]["subagentLaunchPolicy"]>,
                  },
                })}
              >
                <option value="first-message">首轮自动</option>
                <option value="every-message">每轮自动</option>
                <option value="manual">手动启动</option>
              </select>
            </label>
          </div>

          <div className="settings-row__actions settings-row__actions--start" style={{ margin: "8px 0 12px" }}>
            <button
              className={`button ${configView === "simple" ? "button--primary" : "button--secondary"}`}
              type="button"
              onClick={() => setConfigView("simple")}
            >
              简单表单
            </button>
            <button
              className={`button ${configView === "orchestration" ? "button--primary" : "button--secondary"}`}
              type="button"
              onClick={() => setConfigView("orchestration")}
            >
              编排视图
            </button>
          </div>

          {configView === "orchestration" && editGraph ? (
            <div className="settings-section" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>模板编排预览</div>
              <div className="settings-row__description" style={{ marginBottom: 10 }}>
                这是第一版 ComfyUI-like 模板图：节点由当前配置自动生成，保存后会写入开发模式提示词。可以先用角色按钮快速搭出流程，下一版再支持自由拖拽连线。
              </div>
              <div className="settings-row__actions settings-row__actions--start" style={{ marginBottom: 10 }}>
                {ROLE_OPTIONS.map((role) => {
                  const active = editConfiguredRoles.has(role.value);
                  const existingIndex = editPreset.config.subagents.findIndex((agent) => agent.role === role.value);
                  const existsUnused = existingIndex >= 0 && editPreset.config.subagents[existingIndex]?.enabled === false;
                  return (
                    <button
                      className={`button ${active ? "button--secondary" : "button--secondary"}`}
                      type="button"
                      key={role.value}
                      onClick={() => {
                        if (active) {
                          // 停用当前使用中的角色
                          const target = editPreset.config.subagents.find((agent) => agent.role === role.value && agent.enabled !== false);
                          if (target) {
                            const next = editPreset.config.subagents.map((agent) =>
                              agent.id === target.id ? { ...agent, enabled: false } : agent
                            );
                            setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                          }
                          return;
                        }
                        if (existsUnused) {
                          const next = [...editPreset.config.subagents];
                          const existing = next[existingIndex];
                          if (existing) {
                            next[existingIndex] = { ...existing, enabled: true };
                          }
                          setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                          return;
                        }
                        setEditPreset({
                          ...editPreset,
                          config: {
                            ...editPreset.config,
                            subagents: [...editPreset.config.subagents, newSubagent(role.value)],
                          },
                        });
                      }}
                    >
                      {active ? `取消 ${role.label}` : existsUnused ? `启用 ${role.label}` : `+ ${role.label}`}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>使用中</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {editGraph.nodes.map((node) => {
                  const roleColor = node.role ? ROLE_OPTIONS.find((r) => r.value === node.role)?.color : undefined;
                  const nodeBorderColor = roleColor ?? (node.kind === "agent" ? "#4b5563" : undefined);
                  return (
                    <div
                      key={node.id}
                      style={{
                        border: `1px solid ${nodeBorderColor ?? "var(--border)"}`,
                        borderLeft: `4px solid ${nodeBorderColor ?? "var(--border)"}`,
                        borderRadius: 10,
                        padding: "8px 10px",
                        minWidth: 130,
                        background: "var(--surface-muted)",
                      }}
                    >
                    <div style={{ fontWeight: 600 }}>{node.label}</div>
                    <div className="settings-list__meta">{node.kind}{node.role ? ` · ${node.role}` : ""}</div>
                    {node.model ? (
                      <div className="settings-list__meta">{node.model.provider}:{node.model.modelId || "未选模型"}</div>
                    ) : null}
                    {node.description ? (
                      <div className="settings-list__meta">{node.description}</div>
                    ) : null}
                    {node.id.startsWith("subagent-") || node.id === "docs" || node.id === "tools" || node.id === "worktree" ? (
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => {
                          if (node.id.startsWith("subagent-")) {
                            const agentId = node.id.replace(/^subagent-/, "");
                            const next = editPreset.config.subagents.map((agent) => (
                              agent.id === agentId ? { ...agent, enabled: false } : agent
                            ));
                            setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                            return;
                          }
                          if (node.id === "docs") {
                            setEditPreset({
                              ...editPreset,
                              config: {
                                ...editPreset.config,
                                documentContext: {
                                  enabled: false,
                                  paths: editPreset.config.documentContext?.paths ?? [],
                                  shareWithSubagents: editPreset.config.documentContext?.shareWithSubagents ?? true,
                                },
                              },
                            });
                            return;
                          }
                          if (node.id === "tools") {
                            setEditPreset({
                              ...editPreset,
                              config: {
                                ...editPreset.config,
                                toolContext: {
                                  enabled: false,
                                  enabledExtensionPaths: editPreset.config.toolContext?.enabledExtensionPaths ?? [],
                                },
                              },
                            });
                            return;
                          }
                          setEditPreset({ ...editPreset, config: { ...editPreset.config, environment: "local" } });
                        }}
                        style={{ marginTop: 6 }}
                      >
                        暂停使用
                      </button>
                    ) : null}
                  </div>
                  );
                })}
              </div>
              {editWorkflowModel && editWorkflowModel.unusedNodes.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>未使用 / 备用节点池</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {editWorkflowModel.unusedNodes.map((node) => {
                  const roleColor = node.role ? ROLE_OPTIONS.find((r) => r.value === node.role)?.color : undefined;
                  return (
                    <button
                      className="button button--secondary"
                      type="button"
                      key={node.id}
                      onClick={() => {
                        const agentId = node.id.replace(/^subagent-/, "");
                        const next = editPreset.config.subagents.map((agent) => (
                          agent.id === agentId ? { ...agent, enabled: true } : agent
                        ));
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                      style={{
                        height: "auto",
                        minWidth: 130,
                        justifyContent: "flex-start",
                        padding: "8px 10px",
                        borderLeft: roleColor ? `4px solid ${roleColor}` : undefined,
                      }}
                    >
                      启用 {node.label}
                    </button>
                  );
                })}
                  </div>
                </div>
              ) : null}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>执行连线</div>
                <div className="settings-list">
                  {editGraph.edges.map((edge) => {
                    const from = editGraph.nodes.find((node) => node.id === edge.from)?.label ?? edge.from;
                    const to = editGraph.nodes.find((node) => node.id === edge.to)?.label ?? edge.to;
                    return (
                      <div className="settings-list__row" key={`${edge.from}-${edge.to}-${edge.label ?? ""}`}>
                        <span>{from} → {to}</span>
                        {edge.label ? <span className="settings-list__meta">{edge.label}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>主 Agent</legend>
            <div className="settings-quick-grid">
              <label className="settings-field">
                <span>提供商</span>
                <select
                  className="settings-select"
                  value={editPreset.config.mainAgent.provider}
                  onChange={(e) => setEditPreset({
                    ...editPreset,
                    config: { ...editPreset.config, mainAgent: { ...editPreset.config.mainAgent, provider: e.target.value, modelId: editPreset.config.mainAgent.modelId && e.target.value !== editPreset.config.mainAgent.provider ? "" : editPreset.config.mainAgent.modelId } },
                  })}
                >
                  <option value="">选择提供商</option>
                  {providerOptions.map((pid) => (
                    <option key={pid} value={pid}>{pid}</option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>模型</span>
                <select
                  className="settings-select"
                  value={editPreset.config.mainAgent.modelId}
                  onChange={(e) => setEditPreset({
                    ...editPreset,
                    config: { ...editPreset.config, mainAgent: { ...editPreset.config.mainAgent, modelId: e.target.value } },
                  })}
                >
                  <option value="">选择模型</option>
                  {modelOptionsForProvider(editPreset.config.mainAgent.provider).map((m) => (
                    <option key={m.modelId} value={m.modelId}>{m.providerId}: {m.label}</option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>推理强度</span>
                <select
                  className="settings-select"
                  value={editPreset.config.mainAgent.thinkingLevel}
                  onChange={(e) => setEditPreset({
                    ...editPreset,
                    config: { ...editPreset.config, mainAgent: { ...editPreset.config.mainAgent, thinkingLevel: e.target.value } },
                  })}
                >
                  {THINKING_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>项目文档上下文</legend>
            <label className="settings-field" style={{ marginBottom: 8 }}>
              <span>
                <input
                  type="checkbox"
                  checked={editPreset.config.documentContext?.enabled ?? false}
                  onChange={(e) => setEditPreset({
                    ...editPreset,
                    config: {
                      ...editPreset.config,
                      documentContext: {
                        enabled: e.target.checked,
                        paths: editPreset.config.documentContext?.paths ?? [],
                        shareWithSubagents: editPreset.config.documentContext?.shareWithSubagents ?? true,
                      },
                    },
                  })}
                  style={{ marginRight: 6 }}
                />
                启用项目文档上下文
              </span>
            </label>
            <label className="settings-field">
              <span>文档目录（每行一个）</span>
              <textarea
                className="settings-textarea"
                value={(editPreset.config.documentContext?.paths ?? []).join("\n")}
                onChange={(e) => setEditPreset({
                  ...editPreset,
                  config: {
                    ...editPreset.config,
                    documentContext: {
                      enabled: editPreset.config.documentContext?.enabled ?? true,
                      paths: e.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
                      shareWithSubagents: editPreset.config.documentContext?.shareWithSubagents ?? true,
                    },
                  },
                })}
                placeholder="S:/note/xl-ht"
                rows={3}
              />
            </label>
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>工具扩展</legend>
            <label className="settings-field" style={{ marginBottom: 8 }}>
              <span>
                <input
                  type="checkbox"
                  checked={(editPreset.config.toolContext?.enabled ?? true) && (editPreset.config.toolContext?.enabledExtensionPaths.length ?? 0) > 0}
                  disabled={(editPreset.config.toolContext?.enabledExtensionPaths.length ?? 0) === 0}
                  onChange={(e) => setEditPreset({
                    ...editPreset,
                    config: {
                      ...editPreset.config,
                      toolContext: {
                        enabled: e.target.checked,
                        enabledExtensionPaths: editPreset.config.toolContext?.enabledExtensionPaths ?? [],
                      },
                    },
                  })}
                  style={{ marginRight: 6 }}
                />
                使用已选择的工具扩展
              </span>
            </label>
            {toolExtensions.length > 0 ? (
              <div className="settings-list">
                {toolExtensions.map((extension) => {
                  const selectedPaths = editPreset.config.toolContext?.enabledExtensionPaths ?? [];
                  const checked = selectedPaths.includes(extension.path);
                  return (
                    <label className="settings-toggle settings-toggle--row" key={extension.path}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const current = editPreset.config.toolContext?.enabledExtensionPaths ?? [];
                          const nextPaths = e.target.checked
                            ? [...current, extension.path]
                            : current.filter((entry) => entry !== extension.path);
                          setEditPreset({
                            ...editPreset,
                            config: {
                              ...editPreset.config,
                              toolContext: { enabled: nextPaths.length > 0, enabledExtensionPaths: nextPaths },
                            },
                          });
                        }}
                      />
                      <span>
                        <strong>{extension.label}</strong>
                        <span className="settings-list__meta"> · {extension.tools.join(", ")}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="settings-row__description">当前工作区没有已启用的工具扩展。可以先到“扩展”里启用。</div>
            )}
          </fieldset>

          <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>
              子 Agent（使用中 {editPreset.config.subagents.filter((agent) => agent.enabled !== false).length} / 保留 {editPreset.config.subagents.length}）
            </legend>

            {editPreset.config.subagents.map((agent, index) => (
              <div key={agent.id} className="settings-list__row" style={{ marginBottom: 8 }}>
                <div className="settings-quick-grid" style={{ gridTemplateColumns: "0.7fr 1fr 1fr 1fr 1fr 0.8fr auto" }}>
                  <label className="settings-field">
                    <span>使用</span>
                    <input
                      type="checkbox"
                      checked={agent.enabled !== false}
                      onChange={(e) => {
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, enabled: e.target.checked };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                      style={{ marginTop: 8 }}
                    />
                  </label>
                  <label className="settings-field">
                    <span>名称</span>
                    <input
                      className="settings-text-input"
                      value={agent.name}
                      onChange={(e) => {
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, name: e.target.value };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                      placeholder="agent-a"
                    />
                  </label>
                  <label className="settings-field">
                    <span>角色</span>
                    <select
                      className="settings-select"
                      value={agent.role ?? "reviewer"}
                      onChange={(e) => {
                        const role = e.target.value as NonNullable<DevelopmentSubagentConfig["role"]>;
                        const roleOption = ROLE_OPTIONS.find((entry) => entry.value === role);
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, role, permission: roleOption?.permission ?? agent.permission };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>提供商</span>
                    <select
                      className="settings-select"
                      value={agent.model.provider}
                      onChange={(e) => {
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, model: { ...agent.model, provider: e.target.value, modelId: agent.model.modelId && e.target.value !== agent.model.provider ? "" : agent.model.modelId } };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                    >
                      <option value="">选择提供商</option>
                      {providerOptions.map((pid) => (
                        <option key={pid} value={pid}>{pid}</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>模型</span>
                    <select
                      className="settings-select"
                      value={agent.model.modelId}
                      onChange={(e) => {
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, model: { ...agent.model, modelId: e.target.value } };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                    >
                      <option value="">选择模型</option>
                      {modelOptionsForProvider(agent.model.provider).map((m) => (
                        <option key={m.modelId} value={m.modelId}>{m.providerId}: {m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>权限</span>
                    <select
                      className="settings-select"
                      value={agent.permission}
                      onChange={(e) => {
                        const next = [...editPreset.config.subagents];
                        next[index] = { ...agent, permission: e.target.value as DevelopmentSubagentConfig["permission"] };
                        setEditPreset({ ...editPreset, config: { ...editPreset.config, subagents: next } });
                      }}
                    >
                      {PERMISSION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      setEditPreset({
                        ...editPreset,
                        config: { ...editPreset.config, subagents: editPreset.config.subagents.filter((_, i) => i !== index) },
                      });
                    }}
                    style={{ marginTop: 20 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            <button
              className="button button--secondary"
              type="button"
              onClick={() => setEditPreset({
                ...editPreset,
                config: { ...editPreset.config, subagents: [...editPreset.config.subagents, newSubagent()] },
              })}
            >
              + 添加子 Agent
            </button>
          </fieldset>

          <div className="settings-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="button button--primary" type="button" onClick={handleSave}>
              保存
            </button>
            <button className="button button--secondary" type="button" onClick={() => { setEditPreset(null); setIsCreating(false); }}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
