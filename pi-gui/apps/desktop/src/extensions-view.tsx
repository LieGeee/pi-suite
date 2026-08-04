import { useMemo, useState } from "react";
import type { RuntimeExtensionRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type { CliToolConfig, ComponentDockState, DifyConfig, DevelopmentModeConfig, DockComponentDefinition, DockComponentGenerationInput, ExtensionCommandCompatibilityRecord, WorkspaceRecord } from "./desktop-state";
import { extensionScopeLabel } from "./extension-display";
import { RefreshIcon } from "./icons";
import { ExtensionCliConfig } from "./extension-cli-config";
import { ExtensionDifyConfig } from "./extension-dify-config";

const EXTENSION_NAV_ITEMS: readonly { path: string; icon: string; title: string; subtitle: string }[] = [
  { path: "__components__", icon: "🧩", title: "组件停靠", subtitle: "管理右侧组件面板" },
  { path: "__development_mode__", icon: "🛠️", title: "开发模式", subtitle: "主/子 Agent 配置" },
  { path: "__background__", icon: "🎨", title: "背景外观", subtitle: "渐变强度与背景" },
  { path: "__cli_tools__", icon: "⌨️", title: "CLI 工具", subtitle: "命令行工具配置" },
];

interface ExtensionsViewProps {
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly commandCompatibility?: readonly ExtensionCommandCompatibilityRecord[];
  readonly selectedExtensionPath?: string;
  readonly onSelectExtension: (path: string) => void;
  readonly selectedDockComponentId?: string;
  readonly backgroundGradientIntensity: number;
  readonly componentDock: ComponentDockState;
  readonly onSetBackgroundGradientIntensity: (value: number) => void;
  readonly onSetComponentDock: (componentDock: ComponentDockState) => void;
  readonly onSaveDockComponentDefinition: (definition: DockComponentDefinition, pinned: boolean) => void;
  readonly onGenerateDockComponentDefinition: (input: DockComponentGenerationInput) => Promise<DockComponentDefinition | null>;
  readonly onRefresh: () => void;
  readonly onOpenExtensionFolder: (filePath: string) => void;
  readonly onOpenComputerUseSettings: () => void;
  readonly onToggleExtension: (filePath: string, enabled: boolean) => void;
  readonly difyConfig?: DifyConfig | null;
  readonly onSaveDifyConfig: (config: DifyConfig) => void;
  readonly cliTools?: readonly CliToolConfig[] | null;
  readonly onSaveCliTools: (tools: readonly CliToolConfig[]) => void;
}

export function ExtensionsView({
  workspace,
  runtime,
  commandCompatibility = [],
  selectedExtensionPath,
  onSelectExtension,
  selectedDockComponentId,
  backgroundGradientIntensity,
  componentDock,
  onSetBackgroundGradientIntensity,
  onSetComponentDock,
  onSaveDockComponentDefinition,
  onGenerateDockComponentDefinition,
  onRefresh,
  onOpenExtensionFolder,
  onOpenComputerUseSettings,
  onToggleExtension,
  difyConfig,
  onSaveDifyConfig,
  cliTools,
  onSaveCliTools,
}: ExtensionsViewProps) {
  const extensions = runtime?.extensions ?? [];
  const selectedExtension =
    selectedExtensionPath === "__background__" || selectedExtensionPath === "__components__" || selectedExtensionPath === "__development_mode__" || selectedExtensionPath === "__cli_tools__"
      ? undefined
      : extensions.find((extension) => extension.path === selectedExtensionPath) ?? extensions[0];
  const selectedExtensionCanBeManaged = selectedExtension ? isManageableExtension(selectedExtension) : false;
  const selectedExtensionIsComputerUse = selectedExtension ? isComputerUseExtension(selectedExtension) : false;
  const selectedCompatibilityRecords = useMemo(
    () =>
      selectedExtension
        ? commandCompatibility
            .filter((record) => record.extensionPath === selectedExtension.path)
            .sort((left, right) => left.commandName.localeCompare(right.commandName))
        : [],
    [commandCompatibility, selectedExtension],
  );

  const renderExtensionConfig = () => {
    const ext = selectedExtension;
    if (!ext) return null;
    if (ext.path.endsWith("dify.ts") || ext.path.endsWith("dify\\index.ts") || ext.path.endsWith("dify/index.ts")) {
      return (
        <ExtensionDifyConfig
          difyConfig={difyConfig}
          onSaveDifyConfig={onSaveDifyConfig}
        />
      );
    }
    return null;
  };

  if (!workspace) {
    return (
      <section className="canvas canvas--empty">
        <div className="empty-panel">
          <div className="session-header__eyebrow">扩展</div>
          <h1>请选择一个工作区</h1>
          <p>扩展会从当前工作区以及你的用户级扩展目录中自动发现。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="canvas" data-testid="extensions-surface">
      <div className="conversation skills-view">
        <header className="view-header">
          <div>
            <div className="chat-header__eyebrow">扩展</div>
            <h1 className="view-header__title">扩展</h1>
            <p className="view-header__body">
              查看并管理当前工作区的运行时扩展。
            </p>
          </div>
          <div className="view-header__actions">
            <button className="button button--secondary" type="button" onClick={onRefresh}>
              <RefreshIcon />
              <span>刷新</span>
            </button>
          </div>
        </header>

        <div className="skills-layout">
          <div className="skills-list">
            <div className="extension-nav-list">
              {EXTENSION_NAV_ITEMS.map((item) => (
                <button
                  className={`extension-nav-item${selectedExtensionPath === item.path ? " extension-nav-item--active" : ""}`}
                  key={item.path}
                  type="button"
                  onClick={() => onSelectExtension(item.path)}
                >
                  <span className="extension-nav-item__icon">{item.icon}</span>
                  <span className="extension-nav-item__text">
                    <span className="extension-nav-item__title">{item.title}</span>
                    <span className="extension-nav-item__sub">{item.subtitle}</span>
                  </span>
                </button>
              ))}
              {extensions.map((extension) => (
                <button
                  className={`extension-nav-item${selectedExtension?.path === extension.path ? " extension-nav-item--active" : ""}`}
                  key={extension.path}
                  type="button"
                  onClick={() => onSelectExtension(extension.path)}
                >
                  <span className="extension-nav-item__icon">🧩</span>
                  <span className="extension-nav-item__text">
                    <span className="extension-nav-item__title">{extension.displayName}</span>
                    <span className="extension-nav-item__sub">
                      {extension.enabled ? "已启用" : "已禁用"} · {extension.sourceInfo.source}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="skill-detail">
            {selectedExtensionPath === "__components__" ? (
              <ComponentManagement
                componentDock={componentDock}
                onSetComponentDock={onSetComponentDock}
                onSaveDockComponentDefinition={onSaveDockComponentDefinition}
                onGenerateDockComponentDefinition={onGenerateDockComponentDefinition}
              />
            ) : selectedExtensionPath === "__development_mode__" ? (
              <DevelopmentModeConfigPanel
                runtime={runtime}
                componentDock={componentDock}
                selectedDockComponentId={selectedDockComponentId}
                onSetComponentDock={onSetComponentDock}
              />
            ) : selectedExtensionPath === "__background__" ? (
              <BackgroundGradientControl
                intensity={backgroundGradientIntensity}
                onSetIntensity={onSetBackgroundGradientIntensity}
              />
            ) : selectedExtensionPath === "__cli_tools__" ? (
              <ExtensionCliConfig
                cliTools={cliTools}
                onSaveCliTools={onSaveCliTools}
              />
            ) : selectedExtension ? (
              <>
                <div className="skill-detail__header">
                  <div>
                    <h2>{selectedExtension.displayName}</h2>
                    <div className="skill-detail__slash">{selectedExtension.sourceInfo.source}</div>
                  </div>
                  <span className={`skill-detail__status ${selectedExtension.enabled ? "skill-detail__status--enabled" : ""}`}>
                    {selectedExtension.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
                <div className="skill-detail__meta-list">
                  <DetailItem label="范围" value={extensionScopeLabel(selectedExtension)} />
                  <DetailItem label="来源" value={selectedExtension.sourceInfo.origin} />
                  <DetailItem label="路径" value={selectedExtension.path} mono />
                  {selectedExtension.sourceInfo.baseDir ? (
                    <DetailItem label="基础目录" value={selectedExtension.sourceInfo.baseDir} mono />
                  ) : null}
                </div>
                {selectedExtensionCanBeManaged ? (
                  <div className="skill-detail__actions">
                    <button className="button button--secondary" type="button" onClick={() => onOpenExtensionFolder(selectedExtension.path)}>
                      打开文件夹
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => onToggleExtension(selectedExtension.path, !selectedExtension.enabled)}
                    >
                      {selectedExtension.enabled ? "禁用" : "启用"}
                    </button>
                  </div>
                ) : null}
                {selectedExtensionIsComputerUse ? (
                  <div className="skill-detail__actions">
                    <button className="button button--secondary" type="button" onClick={onOpenComputerUseSettings}>
                      打开计算机操作设置
                    </button>
                  </div>
                ) : null}

                <ExtensionContributionSection title="命令" items={selectedExtension.commands} emptyLabel="没有提供任何命令。" />
                <ExtensionCompatibilitySection
                  commands={selectedExtension.commands}
                  compatibilityRecords={selectedCompatibilityRecords}
                />
                <ExtensionContributionSection title="工具" items={selectedExtension.tools} emptyLabel="没有提供任何工具。" />
                <ExtensionContributionSection title="标记" items={selectedExtension.flags} emptyLabel="没有提供任何标记。" />
                <ExtensionContributionSection title="快捷键" items={selectedExtension.shortcuts} emptyLabel="没有提供任何快捷键。" />
                <ExtensionDiagnostics diagnostics={selectedExtension.diagnostics} />
                {renderExtensionConfig()}
              </>
            ) : (
              <ExtensionsEmptyState message="请先在左侧选择扩展或内置配置项。" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ComponentManagement({
  componentDock,
  onSetComponentDock,
  onSaveDockComponentDefinition,
  onGenerateDockComponentDefinition,
}: {
  readonly componentDock: ComponentDockState;
  readonly onSetComponentDock: (componentDock: ComponentDockState) => void;
  readonly onSaveDockComponentDefinition: (definition: DockComponentDefinition, pinned: boolean) => void;
  readonly onGenerateDockComponentDefinition: (input: DockComponentGenerationInput) => Promise<DockComponentDefinition | null>;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DockComponentDefinition["kind"]>("development-mode");
  const [icon, setIcon] = useState("🤖");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMode, setAiMode] = useState<"new" | "edit">("new");
  const [aiTargetId, setAiTargetId] = useState("");
  const [aiPinned, setAiPinned] = useState(true);
  const [aiPending, setAiPending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDraftJson, setAiDraftJson] = useState("");

  const togglePinned = (componentId: string, checked: boolean) => {
    const pinnedComponentIds = checked
      ? [...componentDock.pinnedComponentIds, componentId]
      : componentDock.pinnedComponentIds.filter((id) => id !== componentId);
    onSetComponentDock({ ...componentDock, pinnedComponentIds });
  };

  const addComponent = () => {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    const id = `${kind}-${Date.now().toString(36)}`;
    const definition: DockComponentDefinition = {
      id,
      label: nextLabel,
      icon: icon.trim() || "🧩",
      kind,
      source: "user",
      description: "用户配置的 Dock 组件。",
      ...(kind === "development-mode" ? {
        developmentMode: {
          mainAgent: { provider: "", modelId: "", thinkingLevel: "medium" },
          subagents: [],
        },
      } : {}),
      configJson: "{}",
    };
    onSaveDockComponentDefinition(definition, true);
    setLabel("");
  };

  const generateAiDraft = () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiPending) return;
    const existingDefinition = aiMode === "edit"
      ? componentDock.componentDefinitions.find((component) => component.id === aiTargetId)
      : undefined;
    setAiPending(true);
    setAiError("");
    onGenerateDockComponentDefinition({ prompt, ...(existingDefinition ? { existingDefinition } : {}) })
      .then((definition) => {
        if (!definition) {
          setAiError("没有可用模型或授权，已生成本地草稿；你可以编辑 JSON 后保存。");
          setAiDraftJson(JSON.stringify(createLocalComponentDraft(prompt, existingDefinition), null, 2));
          return;
        }
        setAiDraftJson(JSON.stringify(definition, null, 2));
      })
      .catch((error: unknown) => {
        setAiError(error instanceof Error ? error.message : String(error));
        setAiDraftJson(JSON.stringify(createLocalComponentDraft(prompt, existingDefinition), null, 2));
      })
      .finally(() => setAiPending(false));
  };

  const saveAiDraft = () => {
    try {
      const parsed = JSON.parse(aiDraftJson) as DockComponentDefinition;
      const definition = normalizeEditableDockComponent(parsed);
      onSaveDockComponentDefinition(definition, aiPinned);
      setAiError("");
    } catch (error) {
      setAiError(`JSON 无法保存：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="component-config-panel">
      <div className="skill-detail__header">
        <div>
          <h2>组件管理</h2>
          <div className="skill-detail__slash">配置哪些组件显示在右侧 Dock。</div>
        </div>
      </div>
      <section className="component-ai-panel" aria-label="AI 生成/编辑组件">
        <div className="component-ai-panel__header">
          <div>
            <h3>AI 生成/编辑组件</h3>
            <p>描述你想要的 Dock 组件，AI 会生成可编辑的 component.json 草稿。</p>
          </div>
          <label className="settings-toggle settings-toggle--inline">
            <input checked={aiPinned} type="checkbox" onChange={(event) => setAiPinned(event.target.checked)} />
            <span>保存后固定到 Dock</span>
          </label>
        </div>
        <div className="component-ai-panel__grid">
          <label className="settings-field settings-field--wide">
            <span>组件需求描述</span>
            <textarea
              aria-label="组件需求描述"
              className="settings-textarea"
              placeholder="例如：生成一个打开项目日报链接的组件，图标用 📝，保存为外部链接组件。"
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
            />
          </label>
          <label className="settings-field">
            <span>生成方式</span>
            <select aria-label="组件生成方式" className="settings-select" value={aiMode} onChange={(event) => setAiMode(event.target.value as "new" | "edit")}>
              <option value="new">新建组件</option>
              <option value="edit">编辑已有组件</option>
            </select>
          </label>
          {aiMode === "edit" ? (
            <label className="settings-field">
              <span>编辑目标</span>
              <select aria-label="编辑已有组件" className="settings-select" value={aiTargetId} onChange={(event) => setAiTargetId(event.target.value)}>
                <option value="">选择组件</option>
                {componentDock.componentDefinitions.map((component) => (
                  <option key={component.id} value={component.id}>{component.icon} {component.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="skill-detail__actions">
          <button className="button button--primary" disabled={!aiPrompt.trim() || aiPending} type="button" onClick={generateAiDraft}>
            {aiPending ? "生成中…" : "生成组件草稿"}
          </button>
          {aiDraftJson ? (
            <button className="button button--secondary" type="button" onClick={saveAiDraft}>保存 AI 草稿</button>
          ) : null}
        </div>
        {aiError ? <div className="settings-warning">{aiError}</div> : null}
        {aiDraftJson ? (
          <label className="settings-field settings-field--wide">
            <span>组件 JSON 草稿</span>
            <textarea
              aria-label="组件 JSON 草稿"
              className="settings-textarea settings-textarea--code"
              value={aiDraftJson}
              onChange={(event) => setAiDraftJson(event.target.value)}
            />
          </label>
        ) : null}
      </section>
      <div className="settings-quick-grid">
        <label className="settings-field">
          <span>组件名称</span>
          <input aria-label="组件名称" className="settings-text-input" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="settings-field">
          <span>组件类型</span>
          <select aria-label="组件类型" className="settings-select" value={kind} onChange={(event) => setKind(event.target.value as DockComponentDefinition["kind"])}>
            <option value="development-mode">开发模式</option>
            <option value="ai-chat">AI 对话</option>
            <option value="external-link">外部链接</option>
            <option value="extension-action">扩展动作</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        <label className="settings-field">
          <span>图标</span>
          <input aria-label="组件图标" className="settings-text-input" value={icon} onChange={(event) => setIcon(event.target.value)} />
        </label>
      </div>
      <div className="skill-detail__actions">
        <button className="button button--primary" type="button" onClick={addComponent}>添加组件</button>
      </div>
      <div className="settings-list">
        {componentDock.componentDefinitions.map((component) => (
          <label className="settings-toggle settings-toggle--row" key={component.id}>
            <input
              checked={componentDock.pinnedComponentIds.includes(component.id)}
              type="checkbox"
              onChange={(event) => togglePinned(component.id, event.target.checked)}
            />
            <span><strong>{component.icon} {component.label}</strong><span className="settings-list__meta"> · {component.kind}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function createLocalComponentDraft(prompt: string, existingDefinition?: DockComponentDefinition): DockComponentDefinition {
  const baseLabel = prompt.split(/[，,。\.\n]/)[0]?.trim().slice(0, 18) || "AI 组件";
  return normalizeEditableDockComponent({
    ...(existingDefinition ?? {}),
    id: existingDefinition?.id || `ai-component-${Date.now().toString(36)}`,
    label: existingDefinition?.label || baseLabel,
    icon: existingDefinition?.icon || "🤖",
    kind: existingDefinition?.kind || "custom",
    source: "user",
    description: prompt.slice(0, 120) || "AI 生成的 Dock 组件。",
    configJson: existingDefinition?.configJson || JSON.stringify({ prompt }, null, 2),
  });
}

function normalizeEditableDockComponent(value: Partial<DockComponentDefinition>): DockComponentDefinition {
  const kind = isDockComponentKind(value.kind) ? value.kind : "custom";
  const label = value.label?.trim() || "AI 组件";
  const id = value.id?.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || `ai-component-${Date.now().toString(36)}`;
  return {
    id,
    label,
    icon: value.icon?.trim() || "🧩",
    kind,
    source: value.source === "extension" ? "extension" : "user",
    description: value.description?.trim() || "AI 生成的 Dock 组件。",
    ...(value.extensionPath ? { extensionPath: value.extensionPath } : {}),
    ...(value.componentPath ? { componentPath: value.componentPath } : {}),
    ...(kind === "development-mode"
      ? { developmentMode: value.developmentMode ?? { mainAgent: { provider: "", modelId: "", thinkingLevel: "medium" }, subagents: [] } }
      : value.developmentMode ? { developmentMode: value.developmentMode } : {}),
    ...(kind === "ai-chat" ? { aiChat: value.aiChat ?? { prompt: "", environment: "local" } } : value.aiChat ? { aiChat: value.aiChat } : {}),
    ...(kind === "external-link" ? { externalLink: value.externalLink ?? { url: "" } } : value.externalLink ? { externalLink: value.externalLink } : {}),
    ...(value.configJson ? { configJson: value.configJson } : { configJson: "{}" }),
  };
}

function isDockComponentKind(value: unknown): value is DockComponentDefinition["kind"] {
  return value === "development-mode" || value === "ai-chat" || value === "external-link" || value === "extension-action" || value === "custom";
}

function DevelopmentModeConfigPanel({
  runtime,
  componentDock,
  selectedDockComponentId,
  onSetComponentDock,
}: {
  readonly runtime: RuntimeSnapshot | undefined;
  readonly componentDock: ComponentDockState;
  readonly selectedDockComponentId?: string;
  readonly onSetComponentDock: (componentDock: ComponentDockState) => void;
}) {
  const developmentComponents = componentDock.componentDefinitions.filter((component) => component.kind === "development-mode");
  const component =
    developmentComponents.find((entry) => entry.id === selectedDockComponentId) ?? developmentComponents[0];
  const [draft, setDraft] = useState<DevelopmentModeConfig>(component?.developmentMode ?? {
    workflow: "manual",
    mainAgent: { provider: "", modelId: "", thinkingLevel: "medium" },
    subagents: [],
  });
  const providerOptions = useMemo(() => (runtime?.providers ?? []).filter((provider) => provider.hasAuth).map((provider) => provider.id), [runtime]);
  const modelOptions = (providerId: string) => (runtime?.models ?? [])
    .filter((model) => model.providerId === providerId)
    .map((model) => ({ modelId: model.modelId, label: model.label || model.modelId }));

  const save = () => {
    if (!component) return;
    onSetComponentDock({
      ...componentDock,
      componentDefinitions: componentDock.componentDefinitions.map((entry) =>
        entry.id === component.id ? { ...entry, developmentMode: draft } : entry,
      ),
    });
  };

  return (
    <div className="component-config-panel">
      <div className="skill-detail__header">
        <div>
          <h2>开发模式配置</h2>
          <div className="skill-detail__slash">由组件配置生成，不写死在 Dock 中。</div>
        </div>
      </div>
      {component ? (
        <>
          <div className="settings-quick-grid">
            <label className="settings-field">
              <span>主 Agent 提供商</span>
              <select className="settings-select" value={draft.mainAgent.provider} onChange={(event) => setDraft({ ...draft, mainAgent: { ...draft.mainAgent, provider: event.target.value, modelId: event.target.value !== draft.mainAgent.provider ? "" : draft.mainAgent.modelId } })}>
                <option value="">选择提供商</option>
                {providerOptions.map((providerId) => (
                  <option key={providerId} value={providerId}>{providerId}</option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>主 Agent 模型</span>
              <select className="settings-select" value={draft.mainAgent.modelId} onChange={(event) => setDraft({ ...draft, mainAgent: { ...draft.mainAgent, modelId: event.target.value } })}>
                <option value="">选择模型</option>
                {modelOptions(draft.mainAgent.provider).map((model) => (
                  <option key={model.modelId} value={model.modelId}>{model.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="skill-detail__actions">
            <button className="button button--secondary" type="button" onClick={() => setDraft({
              ...draft,
              subagents: [...draft.subagents, {
                id: `subagent-${Date.now().toString(36)}`,
                name: "",
                model: { provider: "", modelId: "", thinkingLevel: "medium" },
                permission: "read",
                trigger: "manual",
              }],
            })}>添加子 Agent</button>
          </div>
          {draft.subagents.map((subagent, index) => (
            <div className="settings-list__row" key={subagent.id}>
              <label className="settings-field">
                <span>子 Agent 名称</span>
                <input
                  aria-label="子 Agent 名称"
                  className="settings-text-input"
                  value={subagent.name}
                  onChange={(event) => setDraft({
                    ...draft,
                    subagents: draft.subagents.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, name: event.target.value } : entry,
                    ),
                  })}
                />
              </label>
            </div>
          ))}
          <details className="settings-disclosure">
            <summary className="settings-disclosure__summary"><span>JSON 配置</span><span>{component.id}</span></summary>
            <pre className="settings-json-preview">{JSON.stringify(draft, null, 2)}</pre>
          </details>
          <div className="skill-detail__actions">
            <button className="button button--primary" type="button" onClick={save}>保存开发模式</button>
          </div>
        </>
      ) : (
        <ExtensionsEmptyState message="先到组件管理添加一个类型为“开发模式”的组件。" />
      )}
    </div>
  );
}

function BackgroundGradientControl({
  intensity,
  onSetIntensity,
}: {
  readonly intensity: number;
  readonly onSetIntensity: (value: number) => void;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(intensity)));
  const configJson = JSON.stringify({ backgroundGradientIntensity: clamped }, null, 2);
  const updateValue = (rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isFinite(parsed)) {
      onSetIntensity(parsed);
    }
  };

  return (
    <section className="extension-appearance-card" aria-label="背景渐变控制">
      <div className="extension-appearance-card__copy">
        <span className="extension-appearance-card__eyebrow">外观扩展</span>
        <h2>背景渐变</h2>
        <p>调整主背景的暗色渐变强度，数值越高背景越沉，文字对比越强。</p>
      </div>
      <div className="background-gradient-control">
        <label className="background-gradient-control__range">
          <span>强度</span>
          <input
            aria-label="背景渐变强度"
            type="range"
            min="0"
            max="100"
            step="1"
            value={clamped}
            onChange={(event) => updateValue(event.currentTarget.value)}
          />
        </label>
        <label className="background-gradient-control__number">
          <span>数值</span>
          <input
            aria-label="背景渐变强度数值"
            type="number"
            min="0"
            max="100"
            value={clamped}
            onChange={(event) => updateValue(event.currentTarget.value)}
          />
        </label>
        <pre className="background-gradient-control__json">{configJson}</pre>
      </div>
    </section>
  );
}

function isManageableExtension(extension: RuntimeExtensionRecord): boolean {
  return extension.sourceInfo.scope === "project" || extension.sourceInfo.scope === "user";
}

function isComputerUseExtension(extension: RuntimeExtensionRecord): boolean {
  return (
    extension.displayName === "Computer Use" &&
    extension.sourceInfo.source === "builtin" &&
    extension.sourceInfo.origin === "top-level"
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <div className="skill-detail__meta-label">{label}</div>
      <div className={mono ? "skill-detail__path" : "skill-detail__description"}>{value}</div>
    </div>
  );
}

function ExtensionContributionSection({
  title,
  items,
  emptyLabel,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly emptyLabel: string;
}) {
  return (
    <div className="skill-detail__meta-list">
      <div>
        <div className="skill-detail__meta-label">{title}</div>
        {items.length > 0 ? (
          <div className="extension-detail__tokens">
            {items.map((item) => (
              <span className="slash-menu__skill-badge" key={item}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="skill-detail__description">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function ExtensionDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: RuntimeExtensionRecord["diagnostics"];
}) {
  return (
    <div className="skill-detail__meta-list">
      <div>
        <div className="skill-detail__meta-label">诊断</div>
        {diagnostics.length > 0 ? (
          <div className="extension-detail__diagnostics">
            {diagnostics.map((diagnostic, index) => (
              <div className={`activity-item activity-item--${diagnostic.type === "error" ? "error" : "info"}`} key={`${diagnostic.message}:${index}`}>
                <div className="activity-item__text">{diagnostic.message}</div>
                {diagnostic.path ? <div className="activity-item__meta">{diagnostic.path}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="skill-detail__description">没有诊断信息。</div>
        )}
      </div>
    </div>
  );
}

function ExtensionCompatibilitySection({
  commands,
  compatibilityRecords,
}: {
  readonly commands: readonly string[];
  readonly compatibilityRecords: readonly ExtensionCommandCompatibilityRecord[];
}) {
  const supported = compatibilityRecords.filter((record) => record.status === "supported");
  const terminalOnly = compatibilityRecords.filter((record) => record.status === "terminal-only");
  const unknown = commands.filter((commandName) =>
    compatibilityRecords.every(
      (record) => record.commandName !== commandName && !record.commandName.startsWith(`${commandName}:`),
    ),
  );

  return (
    <div className="skill-detail__meta-list">
      <div>
        <div className="skill-detail__meta-label">命令兼容性</div>
        <div className="skill-detail__description">
          根据真实 GUI 执行结果学习得到。未列出的命令在真正触发前都属于未知状态。
        </div>
        <div className="extension-detail__tokens">
          {supported.map((record) => (
            <span className="slash-menu__skill-badge" key={`supported:${record.commandName}`}>
              {record.commandName} · 可在图形界面使用
            </span>
          ))}
          {terminalOnly.map((record) => (
            <span className="slash-menu__skill-badge slash-menu__skill-badge--warning" key={`terminal:${record.commandName}`}>
              {record.commandName} · 仅终端
            </span>
          ))}
          {unknown.map((commandName) => (
            <span className="slash-menu__skill-badge" key={`unknown:${commandName}`}>
              {commandName} · 未知
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExtensionsEmptyState({ message }: { readonly message: string }) {
  return (
    <div className="empty-state">
      <h2>未找到扩展</h2>
      <p>{message}</p>
    </div>
  );
}
