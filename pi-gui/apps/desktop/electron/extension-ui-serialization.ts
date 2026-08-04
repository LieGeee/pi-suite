import type {
  SessionExtensionDialogRecord,
  SessionExtensionUiStateRecord,
  SessionExtensionWidgetRecord,
} from "../src/desktop-state";

const EXTENSION_STATUS_TEXT_LIMIT = 2_000;
const EXTENSION_WIDGET_LINE_LIMIT = 2_000;
const EXTENSION_WIDGET_LINES_LIMIT = 80;
const EXTENSION_EDITOR_TEXT_LIMIT = 20_000;
const EXTENSION_DIALOG_TEXT_LIMIT = 8_000;

export interface SerializableExtensionUiStateInput {
  readonly statuses: ReadonlyMap<string, string>;
  readonly widgets: ReadonlyMap<string, SessionExtensionWidgetRecord>;
  readonly pendingDialogs: readonly SessionExtensionDialogRecord[];
  readonly title?: string;
  readonly editorText?: string;
}

export function serializeExtensionUiStateForRenderer(
  state: SerializableExtensionUiStateInput,
): SessionExtensionUiStateRecord {
  return {
    statuses: [...state.statuses.entries()].map(([key, text]) => ({
      key,
      text: truncateExtensionText(text, EXTENSION_STATUS_TEXT_LIMIT, "扩展状态"),
    })),
    widgets: [...state.widgets.values()].map((widget) => ({
      ...widget,
      lines: widget.lines
        .slice(0, EXTENSION_WIDGET_LINES_LIMIT)
        .map((line) => truncateExtensionText(line, EXTENSION_WIDGET_LINE_LIMIT, "扩展面板行")),
    })),
    pendingDialogs: state.pendingDialogs.map(sanitizeDialogForRenderer),
    ...(state.title ? { title: truncateExtensionText(state.title, 1_000, "扩展标题") } : {}),
    ...(state.editorText ? { editorText: truncateExtensionText(state.editorText, EXTENSION_EDITOR_TEXT_LIMIT, "扩展编辑器文本") } : {}),
  };
}

function sanitizeDialogForRenderer(dialog: SessionExtensionDialogRecord): SessionExtensionDialogRecord {
  return mapStringFields(dialog, (value, key) => truncateExtensionText(value, EXTENSION_DIALOG_TEXT_LIMIT, `扩展对话 ${key}`)) as SessionExtensionDialogRecord;
}

function mapStringFields(value: unknown, map: (value: string, key: string) => string, key = "text"): unknown {
  if (typeof value === "string") {
    return map(value, key);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => mapStringFields(entry, map, key));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
    entryKey,
    mapStringFields(entryValue, map, entryKey),
  ] as const);
  return Object.fromEntries(entries);
}

function truncateExtensionText(text: string, limit: number, label: string): string {
  if (limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n…[${label}已截断；完整内容仍保留在主进程/扩展状态中]…`;
}
