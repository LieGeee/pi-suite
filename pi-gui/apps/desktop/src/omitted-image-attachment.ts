export interface OmittedImageAttachmentMetadata {
  readonly dataBytes?: number;
}

export function getOmittedImageAttachment(attachment: unknown): OmittedImageAttachmentMetadata | null {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }
  const record = attachment as { readonly omittedData?: unknown; readonly dataBytes?: unknown };
  if (record.omittedData !== true) {
    return null;
  }
  return { dataBytes: typeof record.dataBytes === "number" ? record.dataBytes : undefined };
}

export function formatAttachmentBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) {
    return "未知大小";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }
  return `${(kib / 1024).toFixed(1)} MiB`;
}
