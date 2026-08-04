import type { DevelopmentWorkflowProjection, TranscriptMessage } from "./desktop-state";
import { parseAgentOutputs, type ParseAgentOutputsOptions } from "./development-workflow-parser";

export type ProjectDevelopmentWorkflowOptions = ParseAgentOutputsOptions;

export function projectDevelopmentWorkflowOutputs(
  transcript: readonly TranscriptMessage[],
  options: ProjectDevelopmentWorkflowOptions = {},
): DevelopmentWorkflowProjection {
  const outputs = Array.from(parseAgentOutputs(transcript, options).values()).map((output) => ({
    role: output.role,
    text: output.text,
    truncated: output.text.includes("侧边栏已截断"),
  }));

  return {
    outputs,
    outputCount: outputs.length,
  };
}
