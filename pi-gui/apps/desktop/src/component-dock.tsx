import { useState } from "react";
import type { ComponentDockState, DockComponentDefinition } from "./desktop-state";

interface ComponentDockProps {
  readonly state: ComponentDockState;
  readonly onChange: (state: ComponentDockState) => void;
  readonly onOpenConfig: (componentId: string) => void;
}

export function ComponentDock({ state, onChange, onOpenConfig }: ComponentDockProps) {
  const [popoverComponentId, setPopoverComponentId] = useState<string | undefined>();
  const pinnedComponents = state.componentDefinitions.filter((component) =>
    state.pinnedComponentIds.includes(component.id),
  );
  const popoverComponent = state.componentDefinitions.find((component) => component.id === popoverComponentId);

  const setActiveComponent = (componentId: string) => {
    onChange({ ...state, activeComponentId: componentId });
  };

  return (
    <div className="component-dock" data-testid="component-dock">
      <div className="component-dock__rail">
        {pinnedComponents.length > 0 ? pinnedComponents.map((component) => (
          <button
            aria-label={component.label}
            className={`component-dock__item ${state.activeComponentId === component.id ? "component-dock__item--active" : ""}`}
            key={component.id}
            type="button"
            title={`${component.label}：左键使用，右键详情`}
            onClick={() => setActiveComponent(component.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setPopoverComponentId(component.id);
            }}
          >
            <span className="component-dock__icon">{component.icon}</span>
            <span className="component-dock__label">{component.label}</span>
          </button>
        )) : (
          <span className="component-dock__empty">组件</span>
        )}
      </div>
      {popoverComponent ? (
        <DockComponentPopover
          component={popoverComponent}
          onClose={() => setPopoverComponentId(undefined)}
          onOpenConfig={() => {
            setPopoverComponentId(undefined);
            onOpenConfig(popoverComponent.id);
          }}
        />
      ) : null}
    </div>
  );
}

function DockComponentPopover({
  component,
  onClose,
  onOpenConfig,
}: {
  readonly component: DockComponentDefinition;
  readonly onClose: () => void;
  readonly onOpenConfig: () => void;
}) {
  return (
    <div className="component-dock__popover" data-testid="component-dock-popover">
      <div className="component-dock__popover-title">{component.label}</div>
      <p>{component.description}</p>
      {component.kind === "development-mode" && component.developmentMode ? (
        <div className="component-dock__popover-meta">
          <span>主 Agent</span>
          <strong>{component.developmentMode.mainAgent.provider}:{component.developmentMode.mainAgent.modelId}</strong>
          <span>子 Agent</span>
          <strong>{component.developmentMode.subagents.length} 个</strong>
        </div>
      ) : null}
      <div className="component-dock__popover-actions">
        <button className="button button--secondary" type="button" onClick={onClose}>
          关闭
        </button>
        <button className="button button--primary" type="button" onClick={onOpenConfig}>
          详细配置
        </button>
      </div>
    </div>
  );
}
