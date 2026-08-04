import type { ComposerAttachment, QueuedComposerMessage } from "./desktop-state";
import { FileIcon } from "./icons";
import { formatAttachmentBytes, getOmittedImageAttachment } from "./omitted-image-attachment";

interface QueuedComposerMessagesProps {
  readonly messages: readonly QueuedComposerMessage[];
  readonly editingQueuedMessageId?: string;
  readonly onEditMessage: (messageId: string) => void;
  readonly onRemoveMessage: (messageId: string) => void;
  readonly onSteerMessage: (messageId: string) => void;
  readonly onCancelEdit: () => void;
}

export function QueuedComposerMessages({
  messages,
  editingQueuedMessageId,
  onEditMessage,
  onRemoveMessage,
  onSteerMessage,
  onCancelEdit,
}: QueuedComposerMessagesProps) {
  if (messages.length === 0 && !editingQueuedMessageId) {
    return null;
  }

  return (
    <div className="queued-composer-messages" data-testid="queued-composer-messages">
      {editingQueuedMessageId ? (
        <div className="queued-composer-messages__editing" data-testid="queued-composer-editing">
          <span>正在编辑排队消息</span>
          <button type="button" onClick={onCancelEdit}>
            取消
          </button>
        </div>
      ) : null}
      {messages.map((message) => (
        <div
          className={`queued-composer-message ${message.id === editingQueuedMessageId ? "queued-composer-message--editing" : ""}`}
          data-testid="queued-composer-message"
          key={message.id}
        >
          <div className="queued-composer-message__header">
            {message.text ? <div className="queued-composer-message__text">{message.text}</div> : null}
            <div className="queued-composer-message__actions">
              {message.mode !== "steer" ? (
                <button type="button" onClick={() => onSteerMessage(message.id)}>
                  插队执行
                </button>
              ) : null}
              <button type="button" onClick={() => onEditMessage(message.id)}>
                编辑
              </button>
              <button aria-label={`删除排队消息 ${message.text || message.id}`} type="button" onClick={() => onRemoveMessage(message.id)}>
                删除
              </button>
            </div>
          </div>
          {message.attachments.length > 0 ? (
            <div className="queued-composer-message__attachments">
              {message.attachments.map((attachment, index) => (
                <QueuedAttachmentPreview attachment={attachment} key={`${message.id}:${attachment.name}:${index}`} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function QueuedAttachmentPreview({ attachment }: { readonly attachment: ComposerAttachment }) {
  const omittedImage = attachment.kind === "image" ? getOmittedImageAttachment(attachment) : null;
  return (
    <div className={`queued-composer-attachment queued-composer-attachment--${attachment.kind}`}>
      {attachment.kind === "image" ? (
        omittedImage ? (
          <span
            className="queued-composer-attachment__icon"
            title="为避免界面内存过高，原图数据未加载到渲染进程；发送时仍会使用完整图片。"
          >
            🖼️
          </span>
        ) : (
          <img
            alt={attachment.name}
            className="queued-composer-attachment__preview"
            src={`data:${attachment.mimeType};base64,${attachment.data}`}
          />
        )
      ) : (
        <span className="queued-composer-attachment__icon" aria-hidden="true">
          <FileIcon />
        </span>
      )}
      <span className="queued-composer-attachment__name">
        {attachment.name}
        {omittedImage ? `（预览省略，${formatAttachmentBytes(omittedImage.dataBytes)}）` : ""}
      </span>
    </div>
  );
}
