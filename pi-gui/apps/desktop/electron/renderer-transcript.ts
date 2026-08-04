import type { ComposerAttachment, QueuedComposerMessage, TranscriptMessage } from "../src/desktop-state";

export const RENDERER_MESSAGE_TEXT_LIMIT = 32_000;
export const RENDERER_STREAMING_REPLACE_STEP = 4_000;
const DEFAULT_RENDERER_TOOL_TEXT_LIMIT = 2_000;
const DEFAULT_RENDERER_TOOL_DETAIL_LIMIT = 2_000;
const DEFAULT_RENDERER_IMAGE_DATA_LIMIT = 96_000;
const OMITTED_IMAGE_PLACEHOLDER_DATA = "";

export interface RendererTranscriptCloneOptions {
  readonly textLimit?: number;
  readonly toolTextLimit?: number;
  readonly imageDataLimit?: number;
}

interface OmittedImageMetadata {
  readonly omittedData?: boolean;
  readonly dataBytes?: number;
}

export interface RendererStreamingPublishCursor {
  readonly messageId: string;
  readonly textLength: number;
}

export type RendererStreamingPublishMode = "append" | "replace" | "skip";

export function cloneTranscriptMessageForRenderer(
  message: TranscriptMessage,
  options: RendererTranscriptCloneOptions = {},
): TranscriptMessage {
  const textLimit = options.textLimit ?? RENDERER_MESSAGE_TEXT_LIMIT;
  const toolTextLimit = options.toolTextLimit ?? DEFAULT_RENDERER_TOOL_TEXT_LIMIT;
  const imageDataLimit = options.imageDataLimit ?? DEFAULT_RENDERER_IMAGE_DATA_LIMIT;

  if (message.kind === "message") {
    return {
      ...message,
      text: truncateRendererText(message.text, textLimit, "消息内容"),
      ...(message.attachments
        ? {
            attachments: message.attachments.map((attachment) => cloneImageLikeAttachmentForRenderer(attachment, imageDataLimit)),
          }
        : {}),
    };
  }

  if (message.kind === "tool") {
    const input = message.input !== undefined ? compactRendererToolValue(message.input, toolTextLimit, "工具输入") : undefined;
    const output = message.output !== undefined ? compactRendererToolValue(message.output, toolTextLimit, "工具输出") : undefined;
    return {
      ...message,
      ...(input ? { input: input.value, ...(input.omitted ? { inputOmitted: true, inputBytes: input.bytes } : {}) } : {}),
      ...(output ? { output: output.value, ...(output.omitted ? { outputOmitted: true, outputBytes: output.bytes } : {}) } : {}),
      ...(message.detail ? { detail: truncateRendererText(message.detail, DEFAULT_RENDERER_TOOL_DETAIL_LIMIT, "工具详情") } : {}),
      ...(message.metadata ? { metadata: truncateRendererText(message.metadata, DEFAULT_RENDERER_TOOL_DETAIL_LIMIT, "工具元数据") } : {}),
    };
  }

  if (message.kind === "activity") {
    return {
      ...message,
      ...(message.detail ? { detail: truncateRendererText(message.detail, 2_000, "活动详情") } : {}),
      ...(message.metadata ? { metadata: truncateRendererText(message.metadata, 2_000, "活动元数据") } : {}),
    };
  }

  if (message.kind === "summary") {
    return {
      ...message,
      ...(message.metadata ? { metadata: truncateRendererText(message.metadata, 2_000, "摘要元数据") } : {}),
    };
  }

  return message;
}

export function cloneTranscriptForRenderer(
  transcript: readonly TranscriptMessage[],
  options: RendererTranscriptCloneOptions = {},
): TranscriptMessage[] {
  return transcript.map((message) => cloneTranscriptMessageForRenderer(message, options));
}

export function resolveRendererStreamingPublishMode(
  previous: RendererStreamingPublishCursor | undefined,
  messageId: string,
  textLength: number,
  options: { readonly force?: boolean } = {},
): RendererStreamingPublishMode {
  if (!previous || previous.messageId !== messageId || textLength < previous.textLength) {
    return "replace";
  }
  if (textLength <= RENDERER_MESSAGE_TEXT_LIMIT) {
    return "append";
  }
  if (previous.textLength <= RENDERER_MESSAGE_TEXT_LIMIT) {
    return "replace";
  }
  if (options.force) {
    return "replace";
  }
  return textLength - previous.textLength >= RENDERER_STREAMING_REPLACE_STEP ? "replace" : "skip";
}

export function cloneComposerAttachmentForRenderer(
  attachment: ComposerAttachment,
  options: Pick<RendererTranscriptCloneOptions, "imageDataLimit"> = {},
): ComposerAttachment {
  return cloneImageLikeAttachmentForRenderer(attachment, options.imageDataLimit ?? DEFAULT_RENDERER_IMAGE_DATA_LIMIT);
}

export function cloneComposerAttachmentsForRenderer(
  attachments: readonly ComposerAttachment[],
  options: Pick<RendererTranscriptCloneOptions, "imageDataLimit"> = {},
): ComposerAttachment[] {
  return attachments.map((attachment) => cloneComposerAttachmentForRenderer(attachment, options));
}

export function cloneQueuedComposerMessagesForRenderer(
  messages: readonly QueuedComposerMessage[],
  options: Pick<RendererTranscriptCloneOptions, "imageDataLimit" | "textLimit"> = {},
): QueuedComposerMessage[] {
  const textLimit = options.textLimit ?? RENDERER_MESSAGE_TEXT_LIMIT;
  return messages.map((message) => ({
    ...message,
    text: truncateRendererText(message.text, textLimit, "排队消息"),
    attachments: cloneComposerAttachmentsForRenderer(message.attachments, options),
  }));
}

function cloneImageLikeAttachmentForRenderer<T extends { readonly kind: string }>(attachment: T, imageDataLimit: number): T {
  if (attachment.kind !== "image") {
    return { ...attachment };
  }
  const image = attachment as T & { readonly data: string };
  if (image.data.length <= imageDataLimit) {
    return { ...attachment };
  }
  return {
    ...attachment,
    data: OMITTED_IMAGE_PLACEHOLDER_DATA,
    omittedData: true,
    dataBytes: image.data.length,
  } as T & OmittedImageMetadata;
}

function compactRendererValue(value: unknown, limit: number, label: string): unknown {
  if (typeof value === "string") {
    return truncateRendererText(value, limit, label);
  }

  const text = stableStringifyForRenderer(value);
  if (text.length <= limit) {
    return value;
  }
  return truncateRendererText(text, limit, label);
}

function compactRendererToolValue(
  value: unknown,
  limit: number,
  label: string,
): { readonly value: unknown; readonly omitted: boolean; readonly bytes: number } {
  if (typeof value === "string") {
    return {
      value: truncateRendererText(value, limit, label),
      omitted: value.length > limit,
      bytes: value.length,
    };
  }

  const text = stableStringifyForRenderer(value);
  if (text.length <= limit) {
    return { value, omitted: false, bytes: text.length };
  }
  return {
    value: truncateRendererText(text, limit, label),
    omitted: true,
    bytes: text.length,
  };
}

function stableStringifyForRenderer(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "bigint") {
        return nested.toString();
      }
      if (typeof nested === "object" && nested !== null) {
        if (seen.has(nested)) {
          return "[Circular]";
        }
        seen.add(nested);
      }
      return nested;
    }, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function truncateRendererText(text: string, limit: number, label: string): string {
  if (text.length <= limit) {
    return text;
  }

  const head = Math.max(0, Math.floor(limit * 0.65));
  const tail = Math.max(0, limit - head);
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n\n…[${label}过长，renderer 已截断 ${omitted.toLocaleString()} 字符；完整内容仍保留在主进程/会话文件中]…\n\n${text.slice(text.length - tail)}`;
}

export function isRendererImageDataOmitted(attachment: unknown): attachment is OmittedImageMetadata {
  return Boolean(
    attachment &&
      typeof attachment === "object" &&
      "omittedData" in attachment &&
      (attachment as OmittedImageMetadata).omittedData,
  );
}
