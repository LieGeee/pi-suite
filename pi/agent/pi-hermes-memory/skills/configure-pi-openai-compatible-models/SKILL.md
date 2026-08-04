---
name: "configure-pi-openai-compatible-models"
description: "Configure and verify custom OpenAI-compatible models in pi, including context limits, reasoning levels, and WAF-sensitive headers."
version: 1
created: "2026-07-23"
updated: "2026-07-23"
---
## When to Use
Use when adding or debugging a custom OpenAI-compatible provider in pi models.json, especially when models show wrong context/output limits, thinking=no, 403 WAF errors, or advertised models fail at request time.

## Procedure
1. Read pi's custom-model documentation and inspect the active PI_CODING_AGENT_DIR; do not assume ~/.pi/agent is active.
2. Translate provider metadata explicitly: limit.context to contextWindow, limit.output to maxTokens, and supported reasoning variants to reasoning=true plus thinkingLevelMap.
3. Represent unsupported pi levels with null. Map pi xhigh to max only when the provider explicitly supports a max effort; otherwise map xhigh to xhigh.
4. If native fetch succeeds but the OpenAI JS SDK returns 403, compare SDK headers. Prefer a provider-scoped User-Agent override in models.json when that alone fixes the WAF response.
5. Add each intended provider/model entry to settings.json enabledModels and keep unsupported account-group aliases out of the selectable list.
6. Validate JSON, run pi --list-models for the provider, capture the generated reasoning payload, and send one minimal real request with the intended thinking level.

## Pitfalls
- A model endpoint may list a model that the current account group cannot actually route; verify with a real request.
- Omitting contextWindow, maxTokens, or reasoning silently uses pi defaults and can look like a provider limitation.
- Do not expose API keys in logs, patches, memory, or final responses.
- Do not apply WAF header overrides globally when only one provider needs them.

## Verification
1. Both models.json and settings.json parse successfully.
2. pi --list-models shows the expected context, output limit, and thinking=yes values.
3. The generated Responses payload contains the expected reasoning.effort value.
4. A no-session, no-tools request returns successfully through the configured provider.