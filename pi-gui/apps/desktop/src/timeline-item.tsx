import { memo, type ReactNode } from "react";
import type { SessionTranscriptMessage } from "@pi-gui/pi-sdk-driver";
import type { TimelineActivity, TimelineToolCall, TimelineSummary, TranscriptMessage } from "./timeline-types";
import { MessageMarkdown } from "./message-markdown";
import { InlineDiff, extractDiffFromOutput } from "./diff-inline";
import { ChevronRightIcon, CopyIcon, DiffIcon, FileIcon } from "./icons";
import { formatAttachmentBytes, getOmittedImageAttachment } from "./omitted-image-attachment";
import { extensionToLanguage } from "./syntax-highlight";

const TimelineItem = memo(function TimelineItem({
  item,
  streaming,
  expandedToolCallIds,
  onToggleToolCall,
  onViewFileInDiff,
}: {
  readonly item: TranscriptMessage;
  readonly streaming?: boolean;
  readonly expandedToolCallIds?: ReadonlySet<string>;
  readonly onToggleToolCall?: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
}) {
  switch (item.kind) {
    case "message":
      return <TimelineMessage item={item} streaming={streaming} />;
    case "activity":
      return <TimelineActivityItem item={item} />;
    case "tool":
      return (
        <TimelineToolCallItem
          item={item}
          expanded={expandedToolCallIds?.has(item.callId) ?? false}
          onToggle={onToggleToolCall}
          onViewFileInDiff={onViewFileInDiff}
        />
      );
    case "summary":
      return <TimelineSummaryItem item={item} />;
    default:
      return null;
  }
}, function timelineItemPropsEqual(prev, next) {
  if (prev.item !== next.item) return false;
  if (prev.streaming !== next.streaming) return false;
  if (prev.onToggleToolCall !== next.onToggleToolCall) return false;
  if (prev.onViewFileInDiff !== next.onViewFileInDiff) return false;
  if (prev.item.kind === "tool" && next.item.kind === "tool") {
    const prevExpanded = prev.expandedToolCallIds?.has(prev.item.callId) ?? false;
    const nextExpanded = next.expandedToolCallIds?.has(next.item.callId) ?? false;
    if (prevExpanded !== nextExpanded) return false;
  }
  return true;
});
export { TimelineItem };

const LONG_TEXT_THRESHOLD = 2000;

function LongTextContainer({
  text,
  children,
}: {
  readonly text: string;
  readonly children: ReactNode;
}) {
  const long = text.length > LONG_TEXT_THRESHOLD;
  return (
    <div className={long ? "timeline-item__text--long" : undefined}>
      {children}
    </div>
  );
}


function TimelineMessage({ item, streaming }: { readonly item: SessionTranscriptMessage; readonly streaming?: boolean }) {
  if (item.role === "user") {
    return (
      <article className="timeline-item timeline-item--user">
        <div className="timeline-item__bubble">
          {item.attachments?.length ? (
            <div className="timeline-item__attachments">
              {item.attachments.map((attachment, index) => {
                if (attachment.kind === "image") {
                  const omitted = getOmittedImageAttachment(attachment);
                  return omitted ? (
                    <div
                      className="timeline-item__attachment timeline-item__attachment--file"
                      key={`${item.id}:${index}`}
                      title="为避免渲染进程内存过高，图片原始数据未加载到界面；完整内容仍保留在会话/主进程中。"
                    >
                      <span className="timeline-item__attachment-icon" aria-hidden="true">
                        🖼️
                      </span>
                      <span className="timeline-item__attachment-name">
                        {attachment.name ?? `Image ${index + 1}`}（已省略原图，{formatAttachmentBytes(omitted.dataBytes)}）
                      </span>
                    </div>
                  ) : (
                    <img
                      alt={attachment.name ?? `Attachment ${index + 1}`}
                      className="timeline-item__attachment timeline-item__attachment--image"
                      key={`${item.id}:${index}`}
                      src={`data:${attachment.mimeType};base64,${attachment.data}`}
                    />
                  );
                }

                return (
                  <div
                    className="timeline-item__attachment timeline-item__attachment--file"
                    key={`${item.id}:${index}`}
                    title={attachment.fsPath}
                  >
                    <span className="timeline-item__attachment-icon" aria-hidden="true">
                      <FileIcon />
                    </span>
                    <span className="timeline-item__attachment-name">{attachment.name}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <LongTextContainer text={item.text}>
            <MessageMarkdown text={item.text} streaming={streaming} />
          </LongTextContainer>
        </div>
      </article>
    );
  }

  if (item.role === "branchSummary" || item.role === "compactionSummary") {
    return (
      <article className="timeline-item timeline-item--summary-card">
        <div className="timeline-item__summary-eyebrow">
          {item.role === "branchSummary" ? "分支摘要" : "压缩摘要"}
        </div>
        <LongTextContainer text={item.text}>
          <MessageMarkdown text={item.text} streaming={streaming} />
        </LongTextContainer>
      </article>
    );
  }

  return (
    <article className="timeline-item timeline-item--assistant">
      <div className="timeline-item__assistant-header">
        <LongTextContainer text={item.text}>
          <MessageMarkdown text={item.text} streaming={streaming} />
        </LongTextContainer>
        {item.text.length > 0 && !streaming ? (
          <button
            className="icon-button timeline-item__copy-msg"
            type="button"
            aria-label="复制消息"
            onClick={() => navigator.clipboard.writeText(item.text)}
          >
            <CopyIcon />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TimelineActivityItem({ item }: { readonly item: TimelineActivity }) {
  return (
    <div className={`timeline-activity timeline-activity--${item.tone ?? "neutral"}`}>
      <span className="timeline-activity__label">{item.label}</span>
      {item.detail ? <span className="timeline-activity__detail">{item.detail}</span> : null}
      {item.metadata ? <span className="timeline-activity__meta">{item.metadata}</span> : null}
    </div>
  );
}

function TimelineToolCallItem({
  item,
  expanded,
  onToggle,
  onViewFileInDiff,
}: {
  readonly item: TimelineToolCall;
  readonly expanded: boolean;
  readonly onToggle?: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
}) {
  const hasContent = item.input !== undefined || item.output !== undefined;
  const diffText = isWriteTool(item.toolName) ? extractDiffFromOutput(item.output) : undefined;
  const diffStats = diffText ? countDiffStats(diffText) : undefined;
  const compactLabel = buildCompactLabel(item, diffStats);
  const filePath = isWriteTool(item.toolName) ? extractFilename(item.input) || undefined : undefined;
  const diffLanguage = diffText && filePath ? extensionToLanguage(filePath) : undefined;
  const inlineDetail = item.status === "error" ? item.detail : undefined;
  const omittedParts = [
    item.inputOmitted ? `输入 ${formatAttachmentBytes(item.inputBytes)}` : undefined,
    item.outputOmitted ? `输出 ${formatAttachmentBytes(item.outputBytes)}` : undefined,
  ].filter(Boolean);

  const handleCopy = () => {
    const text = diffText ?? formatToolContent(item.input, item.output);
    void navigator.clipboard.writeText(text);
  };

  return (
    <article className={`timeline-tool timeline-tool--${item.status}`}>
      <div className="timeline-tool__header-row">
        <button
          className="timeline-tool__header"
          type="button"
          aria-expanded={expanded}
          disabled={!hasContent}
          onClick={() => onToggle?.(item.callId)}
        >
          {hasContent ? (
            <span className={`timeline-tool__chevron ${expanded ? "timeline-tool__chevron--expanded" : ""}`}>
              <ChevronRightIcon />
            </span>
          ) : null}
          <span className="timeline-tool__label">{compactLabel}</span>
          {inlineDetail ? <span className="timeline-tool__detail">{inlineDetail}</span> : null}
          {diffStats ? (
            <span className="timeline-tool__diff-stats">
              <span className="timeline-tool__stat-add">+{diffStats.added}</span>
              {" "}
              <span className="timeline-tool__stat-del">-{diffStats.removed}</span>
            </span>
          ) : null}
          <span className="timeline-tool__meta-inline">{`${item.toolName} \u00b7 ${statusLabel(item.status)}`}</span>
        </button>
        {filePath && onViewFileInDiff ? (
          <button
            aria-label={`在改动面板中查看 ${filePath}`}
            className="icon-button timeline-tool__view-in-diff"
            data-testid="timeline-tool-view-in-diff"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onViewFileInDiff(filePath);
            }}
          >
            <DiffIcon />
          </button>
        ) : null}
      </div>
      {expanded && hasContent ? (
        <div className="timeline-tool__body">
          {diffText ? (
            <>
              <div className="timeline-tool__diff-header">
                <span className="timeline-tool__diff-filename">
                  {extractFilename(item.input)}
                  {diffStats ? (
                    <span className="timeline-tool__diff-stats">
                      {" "}<span className="timeline-tool__stat-add">+{diffStats.added}</span>
                      {" "}<span className="timeline-tool__stat-del">-{diffStats.removed}</span>
                    </span>
                  ) : null}
                </span>
                <button className="icon-button timeline-tool__copy" type="button" onClick={handleCopy} aria-label="复制差异">
                  <CopyIcon />
                </button>
              </div>
              <InlineDiff diff={diffText} language={diffLanguage} />
            </>
          ) : (
            <>
              <div className="timeline-tool__body-actions">
                {omittedParts.length > 0 ? (
                  <span className="timeline-tool__meta-inline">
                    已按需加载工具内容预览；{omittedParts.join("、")} 原始内容仍保留在主进程/会话文件中。
                  </span>
                ) : null}
                <button className="icon-button timeline-tool__copy" type="button" onClick={handleCopy} aria-label="复制输出">
                  <CopyIcon />
                </button>
              </div>
              <pre className="timeline-tool__pre">{formatToolContent(item.input, item.output)}</pre>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function isWriteTool(toolName: string): boolean {
  return /write|edit|patch|apply/i.test(toolName);
}

function buildCompactLabel(item: TimelineToolCall, diffStats: { added: number; removed: number } | undefined): string {
  if (isWriteTool(item.toolName)) {
    const filename = extractFilename(item.input);
    if (filename) {
      return `已修改 ${shortenPath(filename)}`;
    }
  }
  return item.label;
}

function extractFilename(input: unknown): string {
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    const path = record.file_path ?? record.filePath ?? record.path ?? record.filename;
    if (typeof path === "string") {
      return path;
    }
  }
  return "";
}

function shortenPath(filePath: string): string {
  // Show last 2-3 path segments for readability
  const parts = filePath.split("/");
  if (parts.length <= 3) {
    return filePath;
  }
  return parts.slice(-3).join("/");
}

function countDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed += 1;
    }
  }
  return { added, removed };
}

function formatToolContent(input: unknown, output: unknown): string {
  const parts: string[] = [];
  const formattedInput = formatToolPart(input);
  const formattedOutput = formatToolPart(output);
  if (formattedInput) {
    parts.push(formattedInput);
  }
  if (formattedOutput) {
    parts.push(formattedOutput);
  }
  return parts.join("\n\n");
}

function formatToolPart(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const rendered = value
      .map((entry) => formatToolPart(entry))
      .filter(Boolean);
    return rendered.join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const segments: string[] = [];
    if (typeof record.text === "string") {
      segments.push(record.text);
    }
    if (Array.isArray(record.content)) {
      const rendered = record.content
        .map((entry) => formatToolPart(entry))
        .filter(Boolean);
      if (rendered.length > 0) {
        segments.push(rendered.join("\n"));
      }
    }
    if (typeof record.diff === "string") {
      segments.push(record.diff);
    }
    if (record.details && typeof record.details === "object") {
      const detailsRecord = record.details as Record<string, unknown>;
      if (typeof detailsRecord.errorCode === "string") {
        segments.push(detailsRecord.errorCode);
      }
      const detailsText = formatToolPart(record.details);
      if (detailsText) {
        segments.push(detailsText);
      }
    }
    if (segments.length > 0) {
      return segments.join("\n\n");
    }
    return JSON.stringify(record, null, 2);
  }
  return String(value);
}

function statusLabel(status: "running" | "success" | "error") {
  if (status === "running") return "运行中";
  if (status === "success") return "完成";
  return "失败";
}

function TimelineSummaryItem({ item }: { readonly item: TimelineSummary }) {
  if (item.presentation === "divider") {
    return (
      <div className="timeline-summary">
        <span>{item.label}</span>
        {item.metadata ? <span className="timeline-summary__meta">{item.metadata}</span> : null}
      </div>
    );
  }

  return (
    <div className="timeline-activity timeline-activity--summary">
      <span className="timeline-activity__label">{item.label}</span>
      {item.metadata ? <span className="timeline-activity__meta">{item.metadata}</span> : null}
    </div>
  );
}
