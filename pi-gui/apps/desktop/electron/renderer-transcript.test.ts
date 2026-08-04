import assert from "node:assert/strict";
import test from "node:test";

import type { ComposerAttachment, QueuedComposerMessage, TranscriptMessage } from "../src/desktop-state";
import {
  cloneComposerAttachmentsForRenderer,
  cloneQueuedComposerMessagesForRenderer,
  cloneTranscriptMessageForRenderer,
  resolveRendererStreamingPublishMode,
} from "./renderer-transcript";

const createdAt = "2026-01-01T00:00:00.000Z";

test("renderer transcript omits large image attachment data without mutating the source", () => {
  const largeImageData = "a".repeat(200_000);
  const source: TranscriptMessage = {
    kind: "message",
    id: "message-with-image",
    role: "user",
    text: "please inspect this screenshot",
    createdAt,
    attachments: [
      {
        kind: "image",
        data: largeImageData,
        mimeType: "image/png",
        name: "screenshot.png",
      },
    ],
  };

  const cloned = cloneTranscriptMessageForRenderer(source);

  assert.equal(cloned.kind, "message");
  const attachment = cloned.attachments?.[0];
  assert.equal(attachment?.kind, "image");
  assert.equal(attachment.data, "");
  assert.equal((attachment as unknown as { omittedData?: boolean }).omittedData, true);
  assert.equal((attachment as unknown as { dataBytes?: number }).dataBytes, largeImageData.length);
  assert.equal(source.attachments?.[0]?.kind, "image");
  if (source.attachments?.[0]?.kind === "image") {
    assert.equal(source.attachments[0].data, largeImageData);
  }
});

test("renderer transcript truncates very long message text", () => {
  const source: TranscriptMessage = {
    kind: "message",
    id: "long-message",
    role: "assistant",
    text: "x".repeat(20_000),
    createdAt,
  };

  const cloned = cloneTranscriptMessageForRenderer(source, { textLimit: 1_000 });

  assert.equal(cloned.kind, "message");
  assert.ok(cloned.text.length < source.text.length);
  assert.match(cloned.text, /renderer 已截断/);
  assert.match(cloned.text, /完整内容仍保留/);
});

test("renderer transcript compacts large tool input and output", () => {
  const source: TranscriptMessage = {
    kind: "tool",
    id: "tool-call",
    callId: "tool-call",
    toolName: "read",
    status: "success",
    label: "Read huge file",
    createdAt,
    input: {
      path: "S:/huge.txt",
      nested: Array.from({ length: 100 }, (_, index) => ({
        index,
        text: "i".repeat(5_000),
      })),
    },
    output: "o".repeat(120_000),
  };

  const cloned = cloneTranscriptMessageForRenderer(source);

  assert.equal(cloned.kind, "tool");
  assert.notDeepEqual(cloned.input, source.input);
  assert.equal((cloned as Extract<TranscriptMessage, { kind: "tool" }>).inputOmitted, true);
  assert.equal((cloned as Extract<TranscriptMessage, { kind: "tool" }>).outputOmitted, true);
  assert.equal((cloned as Extract<TranscriptMessage, { kind: "tool" }>).outputBytes, 120_000);
  assert.equal(typeof cloned.output, "string");
  assert.ok((cloned.output as string).length < (source.output as string).length);
  assert.match(cloned.output as string, /renderer 已截断/);
});

test("renderer composer attachment clone omits large image data without mutating source", () => {
  const largeImageData = "b".repeat(200_000);
  const source: ComposerAttachment[] = [
    {
      id: "composer-image",
      kind: "image",
      name: "large-composer.png",
      mimeType: "image/png",
      data: largeImageData,
    },
  ];

  const cloned = cloneComposerAttachmentsForRenderer(source);

  assert.equal(cloned[0]?.kind, "image");
  if (cloned[0]?.kind === "image") {
    assert.equal(cloned[0].data, "");
    assert.equal((cloned[0] as unknown as { omittedData?: boolean }).omittedData, true);
    assert.equal((cloned[0] as unknown as { dataBytes?: number }).dataBytes, largeImageData.length);
  }
  assert.equal(source[0]?.kind, "image");
  if (source[0]?.kind === "image") {
    assert.equal(source[0].data, largeImageData);
  }
});

test("renderer queued composer messages omit large image data and truncate long text", () => {
  const source: QueuedComposerMessage[] = [
    {
      id: "queued",
      mode: "followUp",
      text: "q".repeat(50_000),
      createdAt,
      updatedAt: createdAt,
      attachments: [
        {
          id: "queued-image",
          kind: "image",
          name: "queued.png",
          mimeType: "image/png",
          data: "c".repeat(200_000),
        },
      ],
    },
  ];

  const cloned = cloneQueuedComposerMessagesForRenderer(source);

  assert.ok((cloned[0]?.text.length ?? 0) < 50_000);
  assert.match(cloned[0]?.text ?? "", /renderer 已截断/);
  const attachment = cloned[0]?.attachments[0];
  assert.equal(attachment?.kind, "image");
  if (attachment?.kind === "image") {
    assert.equal(attachment.data, "");
    assert.equal((attachment as unknown as { omittedData?: boolean }).omittedData, true);
  }
});

test("streaming publish policy skips repeated oversized replacements until enough new text arrives", () => {
  assert.equal(resolveRendererStreamingPublishMode(undefined, "assistant-1", 10_000), "replace");
  assert.equal(
    resolveRendererStreamingPublishMode({ messageId: "assistant-1", textLength: 10_000 }, "assistant-1", 10_100),
    "append",
  );
  assert.equal(
    resolveRendererStreamingPublishMode({ messageId: "assistant-1", textLength: 31_900 }, "assistant-1", 32_100),
    "replace",
  );
  assert.equal(
    resolveRendererStreamingPublishMode({ messageId: "assistant-1", textLength: 32_100 }, "assistant-1", 32_200),
    "skip",
  );
  assert.equal(
    resolveRendererStreamingPublishMode({ messageId: "assistant-1", textLength: 32_100 }, "assistant-1", 36_200),
    "replace",
  );
  assert.equal(
    resolveRendererStreamingPublishMode({ messageId: "assistant-1", textLength: 36_200 }, "assistant-1", 36_300, { force: true }),
    "replace",
  );
});
