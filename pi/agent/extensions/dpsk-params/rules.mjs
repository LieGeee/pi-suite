// dpsk provider 请求参数注入
// top_p=0.95, temperature=1.0；仅作用于 provider 为 dpsk 的请求

export function getDpskParams(provider) {
  if (typeof provider !== "string") return undefined;
  if (provider !== "dpsk") return undefined;
  return {
    top_p: 0.95,
    temperature: 1.0,
  };
}

export function injectDpskParams(payload, provider) {
  const params = getDpskParams(provider);
  if (!params) return undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return {
    ...payload,
    ...params,
  };
}
