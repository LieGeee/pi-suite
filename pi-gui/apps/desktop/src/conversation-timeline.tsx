import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject, type RefCallback, type RefObject } from "react";
import type { TranscriptMessage } from "./desktop-state";
import { ThreadSearchBar } from "./thread-search";
import { TimelineItem } from "./timeline-item";

const OVERSCAN_PX = 720;
const MIN_VIRTUALIZED_ITEMS = 24;
const ROW_GAP_PX = 14;
const MAX_SCROLL_DOTS = 20;
export const VIRTUALIZATION_THRESHOLD = 80;

interface ThreadSearchModel {
  readonly isOpen: boolean;
  readonly query: string;
  readonly matchCount: number;
  readonly activeIndex: number;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly search: (query: string) => void;
  readonly goToMatch: (direction: 1 | -1) => void;
  readonly close: () => void;
}

interface ConversationTimelineProps {
  readonly transcript: readonly TranscriptMessage[];
  readonly isTranscriptLoading: boolean;
  readonly timelinePaneRef: MutableRefObject<HTMLDivElement | null>;
  readonly timelinePaneElementRef?: RefCallback<HTMLDivElement>;
  readonly disableVirtualization?: boolean;
  readonly onDisableVirtualizationReady?: () => void;
  readonly onTimelineScroll: () => void;
  readonly onTimelineUserScrollIntent: () => void;
  readonly threadSearch: ThreadSearchModel;
  readonly showJumpToLatest: boolean;
  readonly onJumpToLatest: () => void;
  readonly onContentHeightChange: () => void;
  readonly onViewFileInDiff?: (path: string) => void;
  readonly hasOlderMessages?: boolean;
  readonly onLoadOlderMessages?: () => void;
  readonly isLoadingOlder?: boolean;
  readonly onExpandToolCall?: (callId: string) => void;
  readonly streaming?: boolean;
}

export function ConversationTimeline({
  transcript,
  isTranscriptLoading,
  timelinePaneRef,
  timelinePaneElementRef,
  disableVirtualization = false,
  onDisableVirtualizationReady,
  onTimelineScroll,
  onTimelineUserScrollIntent,
  threadSearch,
  showJumpToLatest,
  onJumpToLatest,
  onContentHeightChange,
  onViewFileInDiff,
  hasOlderMessages = false,
  onLoadOlderMessages,
  isLoadingOlder = false,
  onExpandToolCall,
  streaming = false,
}: ConversationTimelineProps) {
  // Attachment-heavy rows are hard to estimate, so keep those transcripts on
  // the exact DOM path. Long prose is handled by bounded-height rendering
  // (timeline-item__text--long) so virtualized estimates stay reliable.
  const hasUnreliableVirtualizedHeights = transcript.some(
    (item) => item.kind === "message" && Boolean(item.attachments?.length),
  );
  const shouldVirtualize =
    !threadSearch.isOpen &&
    transcript.length > VIRTUALIZATION_THRESHOLD &&
    !disableVirtualization &&
    !hasUnreliableVirtualizedHeights;
  const [expandedToolCallIds, setExpandedToolCallIds] = useState<Set<string>>(() => new Set());
  const measuredHeightsRef = useRef(new Map<string, number>());
  const [measurementVersion, setMeasurementVersion] = useState(0);
  const streamingMessageId = streaming ? latestAssistantMessageId(transcript) : undefined;

  useLayoutEffect(() => {
    const availableToolCallIds = new Set(
      transcript.filter((item): item is Extract<TranscriptMessage, { kind: "tool" }> => item.kind === "tool").map((item) => item.callId),
    );
    setExpandedToolCallIds((current) => {
      if (current.size === 0) {
        return current;
      }
      let changed = false;
      const next = new Set<string>();
      for (const callId of current) {
        if (!availableToolCallIds.has(callId)) {
          changed = true;
          continue;
        }
        next.add(callId);
      }
      return changed ? next : current;
    });
  }, [transcript]);

  useLayoutEffect(() => {
    const knownIds = new Set(transcript.map((item) => item.id));
    let removedAny = false;
    for (const id of measuredHeightsRef.current.keys()) {
      if (knownIds.has(id)) {
        continue;
      }
      measuredHeightsRef.current.delete(id);
      removedAny = true;
    }
    if (removedAny) {
      setMeasurementVersion((current) => current + 1);
    }
  }, [transcript]);

  useLayoutEffect(() => {
    if (!disableVirtualization || isTranscriptLoading || transcript.length === 0) {
      return;
    }
    const allRowsMeasured = transcript.every((item) => measuredHeightsRef.current.has(item.id));
    if (!allRowsMeasured) {
      return;
    }
    onDisableVirtualizationReady?.();
  }, [disableVirtualization, isTranscriptLoading, measurementVersion, onDisableVirtualizationReady, transcript]);

  const toggleToolCall = useCallback((callId: string) => {
    setExpandedToolCallIds((current) => {
      const next = new Set(current);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
        onExpandToolCall?.(callId);
      }
      return next;
    });
  }, [onExpandToolCall]);

  const updateMeasuredHeight = useCallback((id: string, height: number) => {
    const nextHeight = Math.max(1, Math.ceil(height));
    const currentHeight = measuredHeightsRef.current.get(id);
    if (currentHeight === nextHeight) {
      return;
    }
    measuredHeightsRef.current.set(id, nextHeight);
    setMeasurementVersion((current) => current + 1);
  }, []);

  const assignTimelinePaneRef = useCallback((node: HTMLDivElement | null) => {
    timelinePaneRef.current = node;
    timelinePaneElementRef?.(node);
  }, [timelinePaneElementRef, timelinePaneRef]);

  return (
    <div className="timeline-wrapper">
      <div
        className="timeline-pane timeline-pane--thread"
        data-testid="timeline-pane"
        ref={assignTimelinePaneRef}
        onScroll={onTimelineScroll}
        onWheel={(event) => {
          if (event.deltaY < 0) onTimelineUserScrollIntent();
        }}
      >
        {threadSearch.isOpen ? (
          <ThreadSearchBar
            query={threadSearch.query}
            matchCount={threadSearch.matchCount}
            activeIndex={threadSearch.activeIndex}
            inputRef={threadSearch.inputRef}
            onSearch={threadSearch.search}
            onNext={() => threadSearch.goToMatch(1)}
            onPrev={() => threadSearch.goToMatch(-1)}
            onClose={threadSearch.close}
          />
        ) : null}
        {isTranscriptLoading ? (
          <div className="timeline" data-testid="transcript">
            <div className="timeline-empty">正在加载对话记录…</div>
          </div>
        ) : transcript.length === 0 ? (
          <div className="timeline" data-testid="transcript">
            <div className="timeline-empty">发送一条消息开始当前对话。</div>
          </div>
        ) : shouldVirtualize ? (
          <VirtualizedTranscriptList
            transcript={transcript}
            timelinePaneRef={timelinePaneRef}
            onContentHeightChange={onContentHeightChange}
            measuredHeightsRef={measuredHeightsRef}
            measurementVersion={measurementVersion}
            expandedToolCallIds={expandedToolCallIds}
            onHeightChange={updateMeasuredHeight}
            onToggleToolCall={toggleToolCall}
            onViewFileInDiff={onViewFileInDiff}
            streamingMessageId={streamingMessageId}
          />
        ) : (
          <div className="timeline" data-testid="transcript">
            {hasOlderMessages ? (
              <OlderMessagesLoader
                isLoading={isLoadingOlder}
                onLoad={onLoadOlderMessages}
              />
            ) : null}
            {transcript.map((item) => (
              <MeasuredTimelineItem
                item={item}
                key={item.id}
                streaming={item.id === streamingMessageId}
                onHeightChange={updateMeasuredHeight}
                expandedToolCallIds={expandedToolCallIds}
                onToggleToolCall={toggleToolCall}
                onViewFileInDiff={onViewFileInDiff}
              />
            ))}
          </div>
        )}
        {showJumpToLatest ? (
          <button className="timeline-jump" data-testid="timeline-jump" type="button" onClick={onJumpToLatest}>
下方有新内容
          </button>
        ) : null}
      </div>
      <TimelineScrollDots
        transcriptLength={transcript.length}
        timelinePaneRef={timelinePaneRef}
      />
    </div>
  );
}

function VirtualizedTranscriptList({
  transcript,
  timelinePaneRef,
  onContentHeightChange,
  measuredHeightsRef,
  measurementVersion,
  expandedToolCallIds,
  onHeightChange,
  onToggleToolCall,
  onViewFileInDiff,
  streamingMessageId,
}: {
  readonly transcript: readonly TranscriptMessage[];
  readonly timelinePaneRef: MutableRefObject<HTMLDivElement | null>;
  readonly onContentHeightChange: () => void;
  readonly measuredHeightsRef: MutableRefObject<Map<string, number>>;
  readonly measurementVersion: number;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onHeightChange: (id: string, height: number) => void;
  readonly onToggleToolCall: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
  readonly streamingMessageId?: string;
}) {
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const previousTotalHeightRef = useRef(0);
  void measurementVersion;

  useLayoutEffect(() => {
    const pane = timelinePaneRef.current;
    if (!pane) {
      return undefined;
    }

    const syncViewport = () => {
      const nextScrollTop = pane.scrollTop;
      const nextHeight = pane.clientHeight;
      setViewport((current) =>
        current.scrollTop === nextScrollTop && current.height === nextHeight
          ? current
          : { scrollTop: nextScrollTop, height: nextHeight },
      );
    };

    syncViewport();
    pane.addEventListener("scroll", syncViewport, { passive: true });
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(pane);

    return () => {
      pane.removeEventListener("scroll", syncViewport);
      resizeObserver.disconnect();
    };
  }, [timelinePaneRef]);

  const rowHeights = transcript.map((item) => measuredHeightsRef.current.get(item.id) ?? estimateTimelineItemHeight(item));
  const rowOffsets: number[] = [];
  let totalHeight = 0;
  for (const [index, rowHeight] of rowHeights.entries()) {
    rowOffsets[index] = totalHeight;
    totalHeight += rowHeight;
    if (index < rowHeights.length - 1) {
      totalHeight += ROW_GAP_PX;
    }
  }

  useLayoutEffect(() => {
    if (previousTotalHeightRef.current === totalHeight) {
      return;
    }
    previousTotalHeightRef.current = totalHeight;
    onContentHeightChange();
  }, [onContentHeightChange, totalHeight]);

  const startOffset = Math.max(0, viewport.scrollTop - OVERSCAN_PX);
  const endOffset = viewport.scrollTop + viewport.height + OVERSCAN_PX;
  let startIndex = findStartIndex(rowOffsets, rowHeights, startOffset);
  let endIndex = findEndIndex(rowOffsets, endOffset);
  const missingItems = Math.max(0, MIN_VIRTUALIZED_ITEMS - (endIndex - startIndex));
  const availableAfter = transcript.length - endIndex;
  const addAfter = Math.min(missingItems, availableAfter);
  endIndex += addAfter;
  startIndex = Math.max(0, startIndex - (missingItems - addAfter));

  return (
    <div className="timeline timeline--virtualized" data-testid="transcript" style={{ height: `${totalHeight}px` }}>
      {transcript.slice(startIndex, endIndex).map((item, offsetIndex) => {
        const index = startIndex + offsetIndex;
        return (
          <MeasuredTimelineItem
            item={item}
            key={item.id}
            className="timeline__virtual-row"
            top={rowOffsets[index] ?? 0}
            streaming={item.id === streamingMessageId}
            onHeightChange={onHeightChange}
            expandedToolCallIds={expandedToolCallIds}
            onToggleToolCall={onToggleToolCall}
            onViewFileInDiff={onViewFileInDiff}
          />
        );
      })}
    </div>
  );
}

function MeasuredTimelineItem({
  item,
  className,
  top,
  onHeightChange,
  streaming,
  expandedToolCallIds,
  onToggleToolCall,
  onViewFileInDiff,
}: {
  readonly item: TranscriptMessage;
  readonly className?: string;
  readonly top?: number;
  readonly onHeightChange: (id: string, height: number) => void;
  readonly streaming?: boolean;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onToggleToolCall: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | undefined>(undefined);

  useLayoutEffect(() => {
    const element = rowRef.current;
    if (!element) {
      return undefined;
    }

    const measure = () => {
      resizeTimerRef.current = undefined;
      onHeightChange(item.id, element.getBoundingClientRect().height);
    };

    const scheduleMeasure = () => {
      if (resizeTimerRef.current === undefined) {
        resizeTimerRef.current = requestAnimationFrame(measure);
      }
    };

    // Initial measurement
    scheduleMeasure();

    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimerRef.current !== undefined) {
        cancelAnimationFrame(resizeTimerRef.current);
        resizeTimerRef.current = undefined;
      }
    };
  }, [item.id, onHeightChange]);

  return (
    <div
      className={className}
      ref={rowRef}
      style={top == null ? undefined : { transform: `translateY(${top}px)` }}
    >
      <TimelineItem
        item={item}
        streaming={streaming}
        expandedToolCallIds={expandedToolCallIds}
        onToggleToolCall={onToggleToolCall}
        onViewFileInDiff={onViewFileInDiff}
      />
    </div>
  );
}

function OlderMessagesLoader({
  isLoading,
  onLoad,
}: {
  readonly isLoading: boolean;
  readonly onLoad?: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (isLoading || !onLoad || !btnRef.current) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          onLoad();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(btnRef.current);
    return () => observer.disconnect();
  }, [isLoading, onLoad]);

  return (
    <button
      ref={btnRef}
      className="timeline-load-more"
      data-testid="timeline-load-more"
      type="button"
      onClick={onLoad}
      disabled={isLoading || !onLoad}
    >
      {isLoading ? "正在加载历史消息…" : "加载更多历史消息"}
    </button>
  );
}

function TimelineScrollDots({
  transcriptLength,
  timelinePaneRef,
}: {
  readonly transcriptLength: number;
  readonly timelinePaneRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (transcriptLength === 0) return null;

  const step = Math.max(1, Math.ceil(transcriptLength / MAX_SCROLL_DOTS));
  const dotCount = Math.ceil(transcriptLength / step);
  const [activeDot, setActiveDot] = useState(-1);
  const tickingRef = useRef(false);

  useLayoutEffect(() => {
    const pane = timelinePaneRef.current;
    if (!pane) return;

    const update = () => {
      const p = timelinePaneRef.current;
      if (!p) {
        tickingRef.current = false;
        return;
      }
      const scrollable = p.scrollHeight - p.clientHeight;
      const ratio = scrollable <= 0 ? 1 : p.scrollTop / scrollable;
      const dotIndex = Math.round(ratio * (dotCount - 1));
      setActiveDot(Math.max(0, Math.min(dotCount - 1, dotIndex)));
      tickingRef.current = false;
    };

    const onScroll = () => {
      if (!tickingRef.current) {
        requestAnimationFrame(update);
        tickingRef.current = true;
      }
    };

    pane.addEventListener("scroll", onScroll, { passive: true });
    update();

    return () => pane.removeEventListener("scroll", onScroll);
  }, [timelinePaneRef, dotCount]);

  const handleClick = useCallback(
    (index: number) => {
      const pane = timelinePaneRef.current;
      if (!pane) return;
      const scrollable = pane.scrollHeight - pane.clientHeight;
      const lastIndex = dotCount - 1;
      const ratio = lastIndex > 0 ? index / lastIndex : 1;
      pane.scrollTop = ratio * scrollable;
    },
    [timelinePaneRef, dotCount],
  );

  return (
    <div className="timeline-scroll-dots" aria-hidden="true">
      {Array.from({ length: dotCount }, (_, i) => (
        <button
          key={i}
          className={`timeline-scroll-dot${i === activeDot ? " timeline-scroll-dot--active" : ""}`}
          onClick={() => handleClick(i)}
          tabIndex={-1}
          type="button"
          aria-label={`跳转到位置 ${Math.round((i / (dotCount - 1)) * 100)}%`}
        />
      ))}
    </div>
  );
}

function findStartIndex(offsets: readonly number[], heights: readonly number[], targetOffset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const end = (offsets[mid] ?? 0) + (heights[mid] ?? 0);
    if (end < targetOffset) {
      low = mid + 1;
      continue;
    }
    high = mid - 1;
  }

  return Math.max(0, Math.min(offsets.length - 1, low));
}

function findEndIndex(offsets: readonly number[], targetOffset: number): number {
  if (offsets.length === 0) {
    return 0;
  }

  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if ((offsets[mid] ?? 0) <= targetOffset) {
      low = mid + 1;
      continue;
    }
    high = mid - 1;
  }

  const lastVisibleIndex = Math.max(0, low);
  return Math.min(offsets.length, Math.max(lastVisibleIndex + 1, 1));
}

function latestAssistantMessageId(transcript: readonly TranscriptMessage[]): string | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index];
    if (item?.kind === "message" && item.role === "assistant") {
      return item.id;
    }
  }
  return undefined;
}

function estimateTimelineItemHeight(item: TranscriptMessage): number {
  if (item.kind === "message") {
    const attachmentHeight = item.attachments?.some((attachment) => attachment.kind === "image")
      ? 120
      : item.attachments?.length
        ? 56
        : 0;
    const textLength = Math.max(item.text.length, 1);
    return 48 + attachmentHeight + Math.min(240, Math.ceil(textLength / 90) * 20);
  }
  if (item.kind === "tool") {
    return 52;
  }
  if (item.kind === "summary") {
    return item.presentation === "divider" ? 44 : 38;
  }
  return 38;
}
