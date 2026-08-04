import type { DockComponentDefinition } from "../src/desktop-state";

const DOCK_COMPONENT_DESCRIPTION_LIMIT = 2_000;
const DOCK_COMPONENT_CONFIG_JSON_LIMIT = 20_000;
const DOCK_COMPONENT_LABEL_LIMIT = 120;
const DOCK_COMPONENT_ICON_LIMIT = 16;

export function sanitizeDockComponentDefinitionForState(
  definition: DockComponentDefinition,
): DockComponentDefinition {
  return {
    ...definition,
    label: truncateDockText(definition.label, DOCK_COMPONENT_LABEL_LIMIT, "组件标签"),
    icon: truncateDockText(definition.icon, DOCK_COMPONENT_ICON_LIMIT, "组件图标"),
    description: truncateDockText(definition.description, DOCK_COMPONENT_DESCRIPTION_LIMIT, "组件描述"),
    ...(definition.configJson
      ? { configJson: truncateDockText(definition.configJson, DOCK_COMPONENT_CONFIG_JSON_LIMIT, "组件配置 JSON") }
      : {}),
  };
}

function truncateDockText(text: string, limit: number, label: string): string {
  if (limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n…[${label}已截断；完整内容仍保留在组件文件/主进程处理链路中]…`;
}
