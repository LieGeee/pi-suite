import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readExtensionSource(): string {
  return readFileSync(new URL("./index.ts", import.meta.url), "utf8");
}

describe("subagent child JSONL lifecycle", () => {
  it("keeps the decoder alive through post-exit diagnostics", () => {
    const source = readExtensionSource();
    const decoderDeclaration = source.indexOf(
      "const stdoutLines = createJsonLineDecoder();",
    );
    const childWait = source.indexOf(
      "const exitCode = await new Promise<number>",
    );
    const postExitDiagnostics = source.indexOf(
      "if (stdoutLines.droppedLines > 0 || stdoutLines.malformedLines > 0)",
    );

    assert.ok(decoderDeclaration >= 0, "the child JSONL decoder must exist");
    assert.ok(childWait >= 0, "the child process wait must exist");
    assert.ok(
      postExitDiagnostics >= 0,
      "post-exit JSONL diagnostics must exist",
    );
    assert.ok(
      decoderDeclaration < childWait,
      "stdoutLines must be declared in the attempt scope, not inside the awaited child-process callback",
    );
    assert.ok(
      postExitDiagnostics > childWait,
      "diagnostics must be collected after the child settles",
    );
  });

  it("documents the only supported parent-agent parallelism", () => {
    const source = readExtensionSource();

    assert.match(source, /executionMode:\s*"parallel"/);
    assert.match(source, /same assistant response/);
    assert.match(source, /waits for (?:all )?child results/i);
  });

  it("provides an explicit non-blocking background mode", () => {
    const source = readExtensionSource();

    assert.match(source, /background:\s*Type\.Optional/);
    assert.match(source, /background mode requires parallel tasks/i);
    assert.match(source, /background mode requires explicitUserRequest=true/i);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /customType:\s*"subagent-background"/);
    assert.match(source, /deliverAs:\s*"followUp"/);
  });
});
