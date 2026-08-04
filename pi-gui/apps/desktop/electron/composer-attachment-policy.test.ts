import assert from "node:assert/strict";
import test from "node:test";
import { assertComposerImageAttachmentSize, MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES } from "./composer-attachment-policy";

test("assertComposerImageAttachmentSize allows bounded images", () => {
  assert.doesNotThrow(() => assertComposerImageAttachmentSize(MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES, "ok.png"));
});

test("assertComposerImageAttachmentSize rejects oversized images before reading them", () => {
  assert.throws(
    () => assertComposerImageAttachmentSize(MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES + 1, "huge.png"),
    /图片文件过大/,
  );
});
