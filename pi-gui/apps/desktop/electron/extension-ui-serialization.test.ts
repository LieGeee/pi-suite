import assert from "node:assert/strict";
import test from "node:test";
import { serializeExtensionUiStateForRenderer } from "./extension-ui-serialization";

test("serializeExtensionUiStateForRenderer bounds statuses widgets and editor text", () => {
  const serialized = serializeExtensionUiStateForRenderer({
    statuses: new Map([["status", "s".repeat(10_000)]]),
    widgets: new Map([
      [
        "widget",
        {
          key: "widget",
          placement: "aboveComposer",
          lines: ["a".repeat(10_000), "b".repeat(10_000)],
        },
      ],
    ]),
    pendingDialogs: [],
    editorText: "e".repeat(50_000),
  });

  const statusText = serialized.statuses[0]?.text ?? "";
  const widgetLine = serialized.widgets[0]?.lines[0] ?? "";
  const editorText = serialized.editorText ?? "";

  assert.ok(statusText.length < 10_000);
  assert.ok(widgetLine.length < 10_000);
  assert.ok(editorText.length < 50_000);
  assert.match(statusText, /已截断/);
  assert.match(widgetLine, /已截断/);
  assert.match(editorText, /已截断/);
});
