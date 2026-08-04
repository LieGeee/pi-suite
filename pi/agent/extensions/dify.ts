import { Type } from "typebox";
import { registerDifyExtension } from "./dify-extension.mjs";

export default function difyExtension(pi: Parameters<typeof registerDifyExtension>[0]) {
  registerDifyExtension(pi, Type);
}
