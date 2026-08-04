import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConcurrencyForProvider, injectConcurrencyPayload } from "./rules.mjs";

describe("eacase concurrency payload rules", () => {
  it("extracts supported concurrency values from provider names", () => {
    assert.equal(getConcurrencyForProvider("5.6并发4"), 4);
    assert.equal(getConcurrencyForProvider("5.6并发8"), 8);
    assert.equal(getConcurrencyForProvider("5.6并发12"), 12);
    assert.equal(getConcurrencyForProvider("5.6并发16"), 16);
  });

  it("ignores unrelated providers and unsupported values", () => {
    assert.equal(getConcurrencyForProvider("5.6和自动"), undefined);
    assert.equal(getConcurrencyForProvider("5.6并发6"), undefined);
    assert.equal(getConcurrencyForProvider("openai"), undefined);
  });

  it("injects both concurrency and parallel fields for target providers", () => {
    const payload = { model: "gpt-5.6-sol", messages: [], max_tokens: 20 };
    assert.deepEqual(injectConcurrencyPayload(payload, "5.6并发16"), {
      model: "gpt-5.6-sol",
      messages: [],
      max_tokens: 20,
      concurrency: 16,
      parallel: 16,
    });
  });

  it("does not mutate or replace unrelated payloads", () => {
    const payload = { model: "gpt-5.6-sol", messages: [], max_tokens: 20 };
    assert.equal(injectConcurrencyPayload(payload, "5.6和自动"), undefined);
    assert.deepEqual(payload, { model: "gpt-5.6-sol", messages: [], max_tokens: 20 });
  });

  it("does not inject into non-object payloads", () => {
    assert.equal(injectConcurrencyPayload(null, "5.6并发4"), undefined);
    assert.equal(injectConcurrencyPayload("bad", "5.6并发4"), undefined);
  });
});
