import assert from "node:assert/strict";
import test from "node:test";
import { canReadComposerImageFileInRenderer, MAX_RENDERER_COMPOSER_IMAGE_BYTES } from "./composer-attachments";

test("canReadComposerImageFileInRenderer allows bounded images", () => {
  assert.equal(canReadComposerImageFileInRenderer({ size: MAX_RENDERER_COMPOSER_IMAGE_BYTES }), true);
});

test("canReadComposerImageFileInRenderer rejects oversized images", () => {
  assert.equal(canReadComposerImageFileInRenderer({ size: MAX_RENDERER_COMPOSER_IMAGE_BYTES + 1 }), false);
});
