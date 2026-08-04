export const MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function assertComposerImageAttachmentSize(sizeBytes: number, filePath: string): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error(`无法读取图片文件大小: ${filePath}`);
  }
  if (sizeBytes > MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES) {
    throw new Error(
      `图片文件过大，已拒绝读取以保护内存: ${filePath} (${formatBytes(sizeBytes)}，上限 ${formatBytes(MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES)})`,
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}
