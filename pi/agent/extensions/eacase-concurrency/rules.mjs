const SUPPORTED_CONCURRENCY = new Set([4, 8, 12, 16]);

export function getConcurrencyForProvider(provider) {
  if (typeof provider !== "string") return undefined;
  const match = /^5\.6并发(4|8|12|16)$/.exec(provider);
  if (!match) return undefined;
  const value = Number(match[1]);
  return SUPPORTED_CONCURRENCY.has(value) ? value : undefined;
}

export function injectConcurrencyPayload(payload, provider) {
  const concurrency = getConcurrencyForProvider(provider);
  if (!concurrency) return undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return {
    ...payload,
    concurrency,
    parallel: concurrency,
  };
}
