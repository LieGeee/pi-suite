export type DockComponentKind = "development-mode" | "ai-chat" | "external-link" | "extension-action" | "custom";
export type DockComponentSource = "user" | "extension";
export type DockComponentEnvironment = "local" | "worktree";

export interface AgentModelSelection {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel?: string;
}

export type DevelopmentWorkflow = "manual" | "parallel-development" | "proposal-review" | "code-review" | "test-fix";
export type DevelopmentSubagentRole = "architect" | "developer" | "tester" | "reviewer" | "fixer" | "observer";

export interface DevelopmentDocumentContextConfig {
  readonly enabled: boolean;
  readonly paths: readonly string[];
  readonly shareWithSubagents?: boolean;
}

export interface DevelopmentToolContextConfig {
  readonly enabled?: boolean;
  readonly enabledExtensionPaths: readonly string[];
}

export type DevelopmentWorkflowNodeKind = "input" | "docs" | "tools" | "worktree" | "agent" | "summary";

export interface DevelopmentWorkflowNode {
  readonly id: string;
  readonly kind: DevelopmentWorkflowNodeKind;
  readonly label: string;
  readonly role?: DevelopmentSubagentRole;
  readonly model?: AgentModelSelection;
  readonly permission?: "read" | "exec" | "write";
  readonly description?: string;
}

export interface DevelopmentWorkflowEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly loopCount?: number;
}

export interface DevelopmentWorkflowGraph {
  readonly nodes: readonly DevelopmentWorkflowNode[];
  readonly edges: readonly DevelopmentWorkflowEdge[];
}

export interface DevelopmentSubagentConfig {
  readonly id: string;
  readonly name: string;
  readonly role?: DevelopmentSubagentRole;
  readonly enabled?: boolean;
  readonly model: AgentModelSelection;
  readonly permission: "read" | "exec" | "write";
  readonly trigger: "manual" | "after-implementation" | "test-failure";
}

export type DevelopmentSubagentLaunchPolicy = "manual" | "first-message" | "every-message";

export interface DevelopmentModeConfig {
  readonly workflow?: DevelopmentWorkflow;
  readonly environment?: DockComponentEnvironment;
  readonly subagentLaunchPolicy?: DevelopmentSubagentLaunchPolicy;
  readonly mainAgent: AgentModelSelection;
  readonly subagents: readonly DevelopmentSubagentConfig[];
  readonly documentContext?: DevelopmentDocumentContextConfig;
  readonly toolContext?: DevelopmentToolContextConfig;
  readonly graph?: DevelopmentWorkflowGraph;
}

export interface AiChatComponentConfig {
  readonly prompt: string;
  readonly environment: DockComponentEnvironment;
  readonly provider?: string;
  readonly modelId?: string;
  readonly thinkingLevel?: string;
}

export interface ExternalLinkComponentConfig {
  readonly url: string;
  readonly openInNewWindow?: boolean;
}

export interface DockComponentDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly kind: DockComponentKind;
  readonly source: DockComponentSource;
  readonly description: string;
  readonly extensionPath?: string;
  readonly componentPath?: string;
  readonly developmentMode?: DevelopmentModeConfig;
  readonly aiChat?: AiChatComponentConfig;
  readonly externalLink?: ExternalLinkComponentConfig;
  readonly configJson?: string;
}

export interface DockComponentGenerationInput {
  readonly prompt: string;
  readonly existingDefinition?: DockComponentDefinition;
  readonly model?: AgentModelSelection;
  readonly thinkingLevel?: string;
}
