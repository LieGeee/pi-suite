import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { injectConcurrencyPayload } from "./rules.mjs";

export default function eacaseConcurrencyExtension(pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider;
    const payload = injectConcurrencyPayload(event.payload, provider);
    return payload;
  });
}
