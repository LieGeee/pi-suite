import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { injectDpskParams } from "./rules.mjs";

export default function dpskParamsExtension(pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    const provider = ctx.model?.provider;
    const payload = injectDpskParams(event.payload, provider);
    return payload;
  });
}