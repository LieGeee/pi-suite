import { useMemo, useState } from "react";
import type { DesktopAppState } from "./desktop-state";
import { buildDevelopmentWorkflowGraph } from "./development-workflow-graph";
import type { DevelopmentWorkflowNode, DevelopmentWorkflowEdge } from "@pi-gui/pi-sdk-driver";

interface Props {
  readonly snapshot: DesktopAppState;
  readonly selectedTranscript?: unknown;
}

const NODE_KINDS: Record<string, { readonly label: string; readonly icon: string }> = {
  input: { label: "输入", icon: "📝" },
  docs: { label: "文档", icon: "📄" },
  tools: { label: "工具", icon: "🔧" },
  worktree: { label: "沙箱", icon: "📂" },
  agent: { label: "智能体", icon: "🤖" },
  summary: { label: "汇总", icon: "📊" },
};

const ROLE_COLORS: Record<string, string> = {
  architect: "#7c3aed",
  developer: "#2563eb",
  tester: "#059669",
  reviewer: "#d97706",
  fixer: "#dc2626",
  observer: "#6b7280",
};

const WORKFLOW_LABELS: Record<string, string> = {
  manual: "手动编排",
  "parallel-development": "并行开发",
  "proposal-review": "方案评审",
  "code-review": "代码审查",
  "test-fix": "测试修复",
};

export function DevelopmentWorkflowSteps({ snapshot }: Props) {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const key = snapshot.selectedWorkspaceId && snapshot.selectedSessionId
    ? `${snapshot.selectedWorkspaceId}:${snapshot.selectedSessionId}`
    : "";
  const [collapsedSessions, setCollapsedSessions] = useState<Record<string, boolean>>(() => ({}));
  const collapsed = collapsedSessions[key] ?? false;

  const toggleCollapsed = () => {
    setCollapsedSessions((prev) => ({ ...prev, [key]: !collapsed }));
  };

  const workflow = useMemo(() => {
    if (snapshot.appMode !== "development" || !snapshot.activeDevelopmentModePresetId) {
      return undefined;
    }
    const preset = snapshot.developmentModePresets.find(
      (p) => p.id === snapshot.activeDevelopmentModePresetId,
    );
    if (!preset) return undefined;
    const graph = buildDevelopmentWorkflowGraph(preset.config);
    return { preset, graph };
  }, [snapshot.appMode, snapshot.activeDevelopmentModePresetId, snapshot.developmentModePresets]);

  // Parse agent outputs only when the workflow panel can display them.
  const workflowProjection = workflow && !collapsed
    ? snapshot.developmentWorkflowProjection
    : { outputs: [], outputCount: 0 };
  const agentOutputs = useMemo(
    () => new Map(workflowProjection.outputs.map((output) => [output.role, output])),
    [workflowProjection],
  );

  if (!workflow) {
    return null;
  }

  const { preset, graph } = workflow;

  if (collapsed) {
    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          className="button button--secondary"
          type="button"
          onClick={toggleCollapsed}
          title="展开编排步骤"
          style={{
            writingMode: "vertical-lr",
            padding: "12px 4px",
            height: "auto",
            fontSize: "0.8rem",
            borderRadius: "0 6px 6px 0",
            borderLeft: "none",
          }}
        >
          📋 编排步骤
        </button>
      </div>
    );
  }

  const toggleNode = (nodeId: string) => {
    setExpandedNodeId((prev) => (prev === nodeId ? null : nodeId));
  };

  // Determine status for a role-based node
  const getAgentStatus = (node: DevelopmentWorkflowNode): "pending" | "running" | "done" => {
    if (node.role && agentOutputs.has(capitalize(node.role))) {
      return "done";
    }
    if (node.id === "main" && agentOutputs.has("Main")) {
      return "done";
    }
    return "pending";
  };

  const getAgentOutput = (node: DevelopmentWorkflowNode): string | undefined => {
    if (node.id === "main") return agentOutputs.get("Main")?.text;
    if (node.role) return agentOutputs.get(capitalize(node.role))?.text;
    return undefined;
  };

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
          {preset.name} · 编排步骤
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={toggleCollapsed}
          title="折叠编排面板"
          style={{ padding: "2px 6px", fontSize: "0.75rem", height: "auto", minWidth: "auto" }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        工作流：{WORKFLOW_LABELS[preset.config.workflow ?? "manual"] ?? preset.config.workflow ?? "manual"}
        {preset.config.environment === "worktree" ? " · 工作树" : " · 本地"}
        <span style={{ marginLeft: 6 }}>
          {workflowProjection.outputCount > 0
            ? ` · ${workflowProjection.outputCount} 个角色已输出`
            : " · 等待角色输出"}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px" }}>
        <div className="settings-list">
          {graph.nodes.map((node) => {
            const kindInfo = NODE_KINDS[node.kind] ?? { label: node.kind, icon: "•" };
            const expanded = expandedNodeId === node.id;
            const roleColor = node.role ? ROLE_COLORS[node.role] : undefined;
            const status = getAgentStatus(node);
            const output = getAgentOutput(node);

            const statusIcon = status === "done" ? "✅" : status === "running" ? "⏳" : "⏸️";
            const statusColor = status === "done" ? "#059669" : status === "running" ? "#d97706" : "#6b7280";

            return (
              <div key={node.id} style={{ marginBottom: 4 }}>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => toggleNode(node.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 6px",
                    height: "auto",
                    justifyContent: "flex-start",
                    borderLeft: roleColor ? `3px solid ${roleColor}` : "3px solid transparent",
                    fontSize: "0.8rem",
                    opacity: status === "pending" ? 0.6 : 1,
                  }}
                >
                  <span style={{ marginRight: 3 }}>{statusIcon}</span>
                  <strong>{node.label}</strong>
                  <span className="settings-list__meta" style={{ marginLeft: 3, fontSize: "0.75rem", color: statusColor }}>
                    {node.role ?? kindInfo.label}
                    {status === "done" ? " · 完成" : status === "running" ? " · 执行中" : " · 等待"}
                  </span>
                </button>
                {expanded ? (
                  <div
                    style={{
                      marginLeft: 8,
                      padding: "4px 6px",
                      background: "var(--surface-muted)",
                      borderRadius: 4,
                      fontSize: "0.75rem",
                    }}
                  >
                    {node.model?.provider ? (
                      <div className="settings-list__meta">
                        模型：{node.model.provider}:{node.model.modelId || "未选"}
                      </div>
                    ) : null}
                    {node.permission ? (
                      <div className="settings-list__meta">
                        权限：{node.permission === "read" ? "只读" : node.permission === "exec" ? "执行" : "读写"}
                      </div>
                    ) : null}
                    {output ? (
                      <div className="settings-list__meta">
                        <div style={{ fontWeight: 600, marginTop: 4, marginBottom: 2 }}>输出摘要：</div>
                        <div
                          style={{
                            maxHeight: 120,
                            overflow: "hidden",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.3,
                          }}
                        >
                          {output.length > 300 ? `${output.slice(0, 300)}...` : output}
                        </div>
                      </div>
                    ) : null}
                    {!output && node.kind === "agent" ? (
                      <div className="settings-list__meta" style={{ color: "#6b7280" }}>
                        该角色尚未在对话中输出。
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
