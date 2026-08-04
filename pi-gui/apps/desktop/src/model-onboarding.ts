import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import { buildModelOptions } from "./composer-commands";

export type ModelOnboardingSettingsSection = "models" | "providers";

export interface ModelOnboardingNotice {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly actionSection: ModelOnboardingSettingsSection;
}

export interface ModelOnboardingState {
  readonly hasSelectableModels: boolean;
  readonly requiresModelSelection: boolean;
  readonly unselectedModelLabel: string;
  readonly emptyModelTitle: string;
  readonly emptyModelDescription: string;
  readonly notice?: ModelOnboardingNotice;
}

interface ModelSelectionInput {
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
}

export function deriveModelOnboardingState(
  runtime: RuntimeSnapshot | undefined,
  currentSelection: ModelSelectionInput,
): ModelOnboardingState {
  const selectableModels = buildModelOptions(runtime);
  const selectableSet = new Set(selectableModels.map((model) => `${model.providerId}:${model.modelId}`));
  const hasSelectableModels = selectableModels.length > 0;
  const connectedProviderCount = runtime?.providers.filter((provider) => provider.hasAuth).length ?? 0;
  const settingsDefault = {
    provider: runtime?.settings.defaultProvider,
    modelId: runtime?.settings.defaultModelId,
  };
  const hasDefaultModel = Boolean(settingsDefault.provider && settingsDefault.modelId);
  const defaultModelUsable = isUsableSelection(settingsDefault, selectableSet);
  const hasCurrentSelection = Boolean(currentSelection.provider && currentSelection.modelId);
  const currentSelectionUsable = isUsableSelection(currentSelection, selectableSet);

  if (!hasSelectableModels) {
    return {
      hasSelectableModels: false,
      requiresModelSelection: true,
      unselectedModelLabel: "没有可用模型",
      emptyModelTitle: "没有可用模型",
      emptyModelDescription:
        connectedProviderCount > 0
          ? "请到 设置 > 模型 启用模型。"
          : "请到 设置 > 提供商 连接提供商，让模型变为可用。",
      notice: connectedProviderCount > 0
        ? {
            title: "没有可用模型",
            description: "当前所有可用模型都被禁用了。请到 设置 > 模型 重新启用。",
            actionLabel: "打开 设置 > 模型",
            actionSection: "models",
          }
        : {
            title: "没有可用模型",
            description: "请先在 设置 > 提供商 中连接提供商，再选择模型或设置默认值。",
            actionLabel: "打开 设置 > 提供商",
            actionSection: "providers",
          },
    };
  }

  if (hasCurrentSelection && !currentSelectionUsable) {
    return {
      hasSelectableModels: true,
      requiresModelSelection: true,
      unselectedModelLabel: "选择模型",
      emptyModelTitle: "没有可用模型",
      emptyModelDescription: "请选择一个模型。",
      notice: {
        title: "当前模型不可用",
        description: hasDefaultModel
          ? "这个对话当前选择的模型已经不可用。请先改成其他模型，再到 设置 > 模型 更新默认模型。"
          : "这个对话当前选择的模型已经不可用。请先改成其他模型，再到 设置 > 模型 选择应用默认模型。",
        actionLabel: "打开 设置 > 模型",
        actionSection: "models",
      },
    };
  }

  if (!hasDefaultModel) {
    return {
      hasSelectableModels: true,
      requiresModelSelection: !currentSelectionUsable,
      unselectedModelLabel: "选择模型",
      emptyModelTitle: "尚未设置默认模型",
      emptyModelDescription: "请选择一个模型。",
      notice: currentSelectionUsable
        ? undefined
        : {
            title: "尚未设置默认模型",
            description: "请到 设置 > 模型 设置默认模型。",
            actionLabel: "打开 设置 > 模型",
            actionSection: "models",
          },
    };
  }

  if (!defaultModelUsable) {
    const defaultLabel = `${settingsDefault.provider}:${settingsDefault.modelId}`;
    return {
      hasSelectableModels: true,
      requiresModelSelection: !currentSelectionUsable,
      unselectedModelLabel: "选择模型",
      emptyModelTitle: "默认模型不可用",
      emptyModelDescription: "请选择一个模型。",
      notice: {
        title: "默认模型不可用",
        description: currentSelectionUsable
          ? `你保存的默认模型 (${defaultLabel}) 已经不可用。请到 设置 > 模型 更新默认模型。`
          : `你保存的默认模型 (${defaultLabel}) 已经不可用。请先为当前对话选择一个模型，再到 设置 > 模型 更新默认模型。`,
        actionLabel: "打开 设置 > 模型",
        actionSection: "models",
      },
    };
  }

  return {
    hasSelectableModels: true,
    requiresModelSelection: false,
    unselectedModelLabel: "选择模型",
    emptyModelTitle: "没有可用模型",
    emptyModelDescription: "请选择一个模型。",
  };
}

function isUsableSelection(
  selection: ModelSelectionInput,
  selectableSet: ReadonlySet<string>,
): boolean {
  return Boolean(selection.provider && selection.modelId && selectableSet.has(`${selection.provider}:${selection.modelId}`));
}
