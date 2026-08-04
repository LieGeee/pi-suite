import assert from "node:assert/strict";
import test from "node:test";
import type { TranscriptMessage } from "../src/desktop-state";
import { sanitizeMobileTranscriptMessage } from "./mobile-sync-service";

const createdAt = "2026-01-01T00:00:00.000Z";

test("sanitizeMobileTranscriptMessage omits large images and tool payloads", () => {
  const imageData = "a".repeat(200_000);
  const userMessage: TranscriptMessage = {
    kind: "message",
    id: "user-image",
    role: "user",
    text: "inspect",
    createdAt,
    attachments: [
      {
        kind: "image",
        name: "large.png",
        mimeType: "image/png",
        data: imageData,
      },
    ],
  };
  const toolMessage: TranscriptMessage = {
    kind: "tool",
    id: "tool",
    callId: "tool",
    toolName: "read",
    status: "success",
    label: "Read",
    createdAt,
    output: "o".repeat(120_000),
  };

  const sanitizedImage = sanitizeMobileTranscriptMessage(userMessage);
  const sanitizedTool = sanitizeMobileTranscriptMessage(toolMessage);

  assert.equal(sanitizedImage.kind, "message");
  const firstAttachment = sanitizedImage.kind === "message" ? sanitizedImage.attachments?.[0] : undefined;
  assert.equal(firstAttachment?.kind, "image");
  if (firstAttachment?.kind === "image") {
    const attachment = firstAttachment as typeof firstAttachment & {
      readonly omittedData?: boolean;
      readonly dataBytes?: number;
    };
    assert.equal(attachment.data, "");
    assert.equal(attachment.omittedData, true);
    assert.equal(attachment.dataBytes, imageData.length);
  }
  assert.equal(sanitizedTool.kind, "tool");
  if (sanitizedTool.kind === "tool") {
    assert.equal(sanitizedTool.outputOmitted, true);
    assert.equal(sanitizedTool.outputBytes, 120_000);
    assert.equal(typeof sanitizedTool.output, "string");
    assert.ok((sanitizedTool.output as string).length < 120_000);
  }
});
