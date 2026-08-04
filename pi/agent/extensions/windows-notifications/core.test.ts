import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEncodedToastCommand,
  classifyAgentEnd,
  parseNotificationCommand,
  summarizeNotificationText,
} from "./core.js";

describe("Windows notification helpers", () => {
  it("classifies failures before confirmation prompts and completions", () => {
    assert.equal(classifyAgentEnd([{ role: "assistant", stopReason: "error", errorMessage: "HTTP 500", content: [] }]), "failure");
    assert.equal(classifyAgentEnd([{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "是否继续部署？" }] }]), "attention");
    assert.equal(classifyAgentEnd([{ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "构建完成。" }] }]), "complete");
  });

  it("summarizes one line without leaking long output", () => {
    const text = summarizeNotificationText("第一行\n第二行 " + "x".repeat(300));
    assert.equal(text.includes("\n"), false);
    assert.ok(text.length <= 123);
    assert.ok(text.endsWith("..."));
  });

  it("parses supported notification commands", () => {
    assert.deepEqual(parseNotificationCommand(""), { action: "status" });
    assert.deepEqual(parseNotificationCommand("test"), { action: "test" });
    assert.deepEqual(parseNotificationCommand("ON"), { action: "on" });
    assert.deepEqual(parseNotificationCommand("off"), { action: "off" });
    assert.deepEqual(parseNotificationCommand("unknown"), { action: "invalid" });
  });

  it("encodes toast content without interpolating it into PowerShell source", () => {
    const encoded = buildEncodedToastCommand("Pi <任务>", "完成 'ok'");
    const script = Buffer.from(encoded, "base64").toString("utf16le");
    assert.equal(script.includes("Pi <任务>"), false);
    assert.equal(script.includes("完成 'ok'"), false);
    assert.match(script, /ToastNotificationManager/);
  });
});
