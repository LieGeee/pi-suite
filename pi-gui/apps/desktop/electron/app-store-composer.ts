import { randomUUID } from "node:crypto";
import { sessionKey } from "@pi-gui/pi-sdk-driver";
import type { SessionConfig, SessionQueuedMessage, SessionRef } from "@pi-gui/session-driver";
import type { ComposerAttachment, DesktopAppState, DevelopmentModePreset, QueuedComposerMessage, WorkspaceSessionTarget } from "../src/desktop-state";
import { toSessionRef } from "./app-store-utils";
import {
  formatSessionConfigStatus,
  hasRuntimeSlashCommand,
  incompleteComposerCommandMessage,
  parseComposerCommand,
  resolveRuntimeSlashCommand,
} from "../src/composer-commands";
import { appendQueuedUserMessage, appendUserMessage, clearActiveAssistantMessage } from "./app-store-timeline";
import {
  cloneComposerAttachments,
  makeActivityItem,
  makeTranscriptMessage,
  previewFromTranscript,
  toSessionAttachments,
  toSessionQueuedMessages,
  toTranscriptAttachments,
} from "./app-store-utils";
import type { AppStoreInternals } from "./app-store-internals";
import { cloneComposerAttachmentsForRenderer } from "./renderer-transcript";
import { buildDevelopmentModePrompt, buildDevelopmentSubagentPrompt } from "./development-mode-prompt";
import { latestUserTextFromTranscript, shouldAutoLaunchSubagents } from "./development-mode-execution";
import { submitNewQueuedMessage } from "./queued-message-submission";

// Track sessions that have a pending background send to prevent concurrent submission interference
const pendingBackgroundSendsBySession = new Set<string>();

/* ── Public methods ─────────────────────────────────────── */

export async function updateComposerDraft(
  store: AppStoreInternals,
  composerDraft: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (sessionRef) {
    const key = sessionKey(sessionRef);
    if (composerDraft) {
      store.sessionState.composerDraftsBySession.set(key, composerDraft);
    } else {
      store.sessionState.composerDraftsBySession.delete(key);
    }
  }
  store.state = {
    ...store.state,
    composerDraft,
    composerDraftSyncSource: "persist",
    composerDraftSyncNonce: store.allocateComposerDraftSyncNonce(),
    lastError: undefined,
    revision: store.state.revision + 1,
  };
  store.schedulePersistUiState();
  return store.emit();
}

export async function addComposerAttachments(
  store: AppStoreInternals,
  attachments: readonly ComposerAttachment[],
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef || attachments.length === 0) {
    return store.emit();
  }

  const key = sessionKey(sessionRef);
  const existing = store.sessionState.composerAttachmentsBySession.get(key) ?? [];
  const next = [...existing, ...attachments];
  store.sessionState.composerAttachmentsBySession.set(key, next);
  store.state = {
    ...store.state,
    composerAttachments: cloneComposerAttachmentsForRenderer(next),
    revision: store.state.revision + 1,
  };
  await store.persistComposerAttachments(key, next);
  return store.emit();
}

export async function removeComposerAttachment(
  store: AppStoreInternals,
  attachmentId: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  const key = sessionKey(sessionRef);
  const existing = store.sessionState.composerAttachmentsBySession.get(key) ?? [];
  const next = existing.filter((attachment) => attachment.id !== attachmentId);
  if (next.length > 0) {
    store.sessionState.composerAttachmentsBySession.set(key, next);
  } else {
    store.sessionState.composerAttachmentsBySession.delete(key);
  }
  store.state = {
    ...store.state,
    composerAttachments: cloneComposerAttachmentsForRenderer(next),
    revision: store.state.revision + 1,
  };
  await store.persistComposerAttachments(key, next);
  return store.emit();
}

export async function editQueuedComposerMessage(
  store: AppStoreInternals,
  messageId: string,
  currentDraft = "",
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  const key = sessionKey(sessionRef);
  const message = store.getQueuedComposerMessages(sessionRef).find((entry) => entry.id === messageId);
  if (!message) {
    return store.emit();
  }

  store.setQueuedComposerEditState(sessionRef, {
    messageId,
    restoreDraft: currentDraft || store.sessionState.composerDraftsBySession.get(key) || "",
    restoreAttachments: cloneComposerAttachments(store.sessionState.composerAttachmentsBySession.get(key) ?? []),
  });
  store.sessionState.composerDraftsBySession.set(key, message.text);
  store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(message.attachments));
  await store.persistComposerAttachments(key, message.attachments);

  return store.refreshState({
    composerDraft: message.text,
    composerDraftSyncSource: "queued-message-edit",
    clearLastError: true,
    markSelectedSessionViewed: false,
  });
}

export async function cancelQueuedComposerEdit(
  store: AppStoreInternals,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  const editState = store.getQueuedComposerEditState(sessionRef);
  if (!editState) {
    return store.emit();
  }

  const key = sessionKey(sessionRef);
  store.setQueuedComposerEditState(sessionRef, undefined);
  if (editState.restoreDraft) {
    store.sessionState.composerDraftsBySession.set(key, editState.restoreDraft);
  } else {
    store.sessionState.composerDraftsBySession.delete(key);
  }
  if (editState.restoreAttachments.length > 0) {
    store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(editState.restoreAttachments));
  } else {
    store.sessionState.composerAttachmentsBySession.delete(key);
  }
  await store.persistComposerAttachments(key, editState.restoreAttachments);

  return store.refreshState({
    composerDraft: editState.restoreDraft,
    composerDraftSyncSource: "queued-message-edit",
    clearLastError: true,
    markSelectedSessionViewed: false,
  });
}

export async function removeQueuedComposerMessage(
  store: AppStoreInternals,
  messageId: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  const current = store.getQueuedComposerMessages(sessionRef);
  const next = current.filter((message) => message.id !== messageId);
  const editState = store.getQueuedComposerEditState(sessionRef);
  const key = sessionKey(sessionRef);

  if (editState?.messageId === messageId) {
    store.setQueuedComposerEditState(sessionRef, undefined);
    if (editState.restoreDraft) {
      store.sessionState.composerDraftsBySession.set(key, editState.restoreDraft);
    } else {
      store.sessionState.composerDraftsBySession.delete(key);
    }
    if (editState.restoreAttachments.length > 0) {
      store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(editState.restoreAttachments));
    } else {
      store.sessionState.composerAttachmentsBySession.delete(key);
    }
    await store.persistComposerAttachments(key, editState.restoreAttachments);
  }

  await store.driver.replaceQueuedMessages(sessionRef, toSessionQueuedMessages(next));
  return store.refreshState({
    ...(editState?.messageId === messageId
      ? {
          composerDraft: editState.restoreDraft,
          composerDraftSyncSource: "queued-message-edit" as const,
        }
      : {}),
    clearLastError: true,
    markSelectedSessionViewed: false,
  });
}

export async function steerQueuedComposerMessage(
  store: AppStoreInternals,
  messageId: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  const current = store.getQueuedComposerMessages(sessionRef);
  const queuedMessage = current.find((message) => message.id === messageId);
  if (!queuedMessage) {
    return store.emit();
  }

  const steeredMessage = {
    ...queuedMessage,
    mode: "steer" as const,
    updatedAt: new Date().toISOString(),
  };
  const next = current.map((message) => (message.id === messageId ? steeredMessage : message));
  const nextSessionQueuedMessages = toSessionQueuedMessages(next);
  const optimisticSteerMessage = nextSessionQueuedMessages.find((message) => message.id === messageId);

  if (optimisticSteerMessage) {
    appendQueuedUserMessage(store.sessionState.transcriptCache, sessionRef, optimisticSteerMessage);
    store.publishSelectedTranscriptFor(sessionRef);
    store.persistTranscriptCacheForSession(sessionRef);
  }

  try {
    await store.driver.replaceQueuedMessages(sessionRef, nextSessionQueuedMessages);
    return store.refreshState({
      clearLastError: true,
      markSelectedSessionViewed: false,
    });
  } catch (error) {
    if (optimisticSteerMessage) {
      removeOptimisticQueuedUserMessage(store, sessionRef, optimisticSteerMessage.id);
    }
    return store.withError(error);
  }
}

export async function submitComposer(
  store: AppStoreInternals,
  textInput: string,
  options: {
    readonly deliverAs?: "steer" | "followUp";
  } = {},
): Promise<DesktopAppState> {
  await store.initialize();
  const text = textInput.trim();
  const sessionRef = store.selectedSessionRef();
  const attachments = sessionRef
    ? store.sessionState.composerAttachmentsBySession.get(sessionKey(sessionRef)) ?? []
    : [];
  if (!text && attachments.length === 0) {
    return store.emit();
  }
  if (!sessionRef) {
    return store.withError("Create or select a session before sending a message.");
  }

  const runtime = store.runtimeByWorkspace.get(sessionRef.workspaceId);
  const sessionCommands = store.sessionState.sessionCommandsBySession.get(sessionKey(sessionRef)) ?? [];
  const runtimeSlashCommand = hasRuntimeSlashCommand(text, runtime, sessionCommands);
  const resolvedRuntimeSlashCommand = runtimeSlashCommand
    ? resolveRuntimeSlashCommand(text, runtime, sessionCommands)
    : undefined;

  if (text.startsWith("/") && !runtimeSlashCommand) {
    const handled = await runComposerCommand(store, sessionRef, text);
    if (handled) {
      return handled;
    }
  }

  const key = sessionKey(sessionRef);
  const selectedSession = store.sessionFromState(sessionRef);
  const isRunning = selectedSession?.status === "running";
  const editingState = store.getQueuedComposerEditState(sessionRef);
  let optimisticSteerMessage: SessionQueuedMessage | undefined;
  try {
    if (resolvedRuntimeSlashCommand) {
      const learnedCompatibility = store.getLearnedRuntimeCommandCompatibility(sessionRef.workspaceId, resolvedRuntimeSlashCommand);
      if (learnedCompatibility?.status === "terminal-only") {
        store.sessionState.composerDraftsBySession.set(key, textInput);
        if (attachments.length > 0) {
          store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(attachments));
          persistComposerAttachmentsInBackground(store, key, attachments);
        }
        store.state = {
          ...store.state,
          composerDraft: textInput,
          composerDraftSyncSource: "command",
          composerDraftSyncNonce: store.allocateComposerDraftSyncNonce(),
          composerAttachments: cloneComposerAttachmentsForRenderer(attachments),
          revision: store.state.revision + 1,
        };
        return store.withError(learnedCompatibility.message);
      }

      store.beginRuntimeCommandExecution(sessionRef, resolvedRuntimeSlashCommand);
    }

    if (isRunning && !resolvedRuntimeSlashCommand) {
      const deliverAs = options.deliverAs ?? "followUp";
      const nextMessage = buildQueuedComposerMessage({
        existing: editingState
          ? store.getQueuedComposerMessages(sessionRef).find((message) => message.id === editingState.messageId)
          : undefined,
        text,
        attachments,
        mode: deliverAs,
      });
      const nextQueuedMessages = editingState
        ? replaceQueuedComposerMessage(
            store.getQueuedComposerMessages(sessionRef),
            editingState.messageId,
            nextMessage,
          )
        : [
            ...store.getQueuedComposerMessages(sessionRef),
            nextMessage,
          ];

      store.sessionState.composerDraftsBySession.delete(key);
      store.sessionState.composerAttachmentsBySession.delete(key);
      store.setQueuedComposerEditState(sessionRef, undefined);
      persistComposerAttachmentsInBackground(store, key, []);
      const nextSessionQueuedMessages = toSessionQueuedMessages(nextQueuedMessages);
      const submittedMessage = nextSessionQueuedMessages.find((message) => message.id === nextMessage.id);
      if (!submittedMessage) {
        throw new Error("排队消息无法提交。");
      }
      optimisticSteerMessage = deliverAs === "steer" ? submittedMessage : undefined;
      if (optimisticSteerMessage) {
        appendQueuedUserMessage(store.sessionState.transcriptCache, sessionRef, optimisticSteerMessage);
        store.publishSelectedTranscriptFor(sessionRef);
        store.persistTranscriptCacheForSession(sessionRef);
      }
      await submitNewQueuedMessage(
        store.driver,
        sessionRef,
        submittedMessage,
        editingState ? { replacementQueue: nextSessionQueuedMessages } : undefined,
      );
      return store.refreshState({
        clearLastError: true,
        markSelectedSessionViewed: false,
      });
    }

    if (!resolvedRuntimeSlashCommand) {
      // Prevent concurrent sends for the same session
      if (pendingBackgroundSendsBySession.has(key)) {
        return store.withError("该对话已有消息正在发送中，请等待完成。");
      }

      const draftToRestoreOnError = textInput;
      const attachmentsToRestoreOnError = cloneComposerAttachments(attachments);
      store.sessionState.composerDraftsBySession.delete(key);
      store.sessionState.composerAttachmentsBySession.delete(key);
      if (editingState) {
        store.setQueuedComposerEditState(sessionRef, undefined);
      }
      persistComposerAttachmentsInBackground(store, key, []);
      pendingBackgroundSendsBySession.add(key);
      const activeDevelopmentPreset = resolveActiveDevelopmentPreset(store);
      const hasExistingUserMessageBeforeSend = (store.sessionState.transcriptCache.get(key) ?? []).some(
        (entry) => entry.kind === "message" && entry.role === "user",
      );
      const subagentsWillRun = activeDevelopmentPreset
        ? shouldAutoLaunchSubagents(activeDevelopmentPreset.config.subagentLaunchPolicy, hasExistingUserMessageBeforeSend)
        : false;
      const developmentMode = resolveDevelopmentModeSendOptions(activeDevelopmentPreset, text, { realSubagentsWillRun: subagentsWillRun });
      void sendMessageToSession(store, sessionRef, text, attachments, developmentMode).finally(() => {
        pendingBackgroundSendsBySession.delete(key);
      }).catch((error) => {
        void handleBackgroundSendFailure(store, sessionRef, {
          error,
          draftToRestore: draftToRestoreOnError,
          attachmentsToRestore: attachmentsToRestoreOnError,
          editStateToRestore: editingState,
        });
      });
      if (activeDevelopmentPreset && subagentsWillRun) {
        void launchDevelopmentSubagentSessions(store, sessionRef, text, attachments, activeDevelopmentPreset).catch((error) => {
          void store.withError(error);
        });
      }
      // Lightweight state update: skip expensive refreshState (listWorkspaces/listSessions/ensureSubscriptions)
      // The driver will emit sessionUpdated events through the subscription to sync status.
      store.state = {
        ...store.state,
        composerDraft: "",
        composerDraftSyncSource: "state",
        composerDraftSyncNonce: store.allocateComposerDraftSyncNonce(),
        composerAttachments: [],
        lastError: undefined,
        revision: store.state.revision + 1,
      };
      store.schedulePersistUiState();
      return store.emit();
    }

    await sendMessageToSession(store, sessionRef, text, attachments);
    const runtimeCommandOutcome = store.finishRuntimeCommandExecution(sessionRef);
    if (runtimeSlashCommand) {
      await store.refreshSessionCommandsFor(sessionRef);
    }
    return store.refreshState({
      clearLastError: !runtimeCommandOutcome?.blockedMessage,
      markSelectedSessionViewed: false,
    });
  } catch (error) {
    if (resolvedRuntimeSlashCommand) {
      store.finishRuntimeCommandExecution(sessionRef);
    }
    if (textInput) {
      store.sessionState.composerDraftsBySession.set(key, textInput);
    }
    if (attachments.length > 0) {
      store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(attachments));
      persistComposerAttachmentsInBackground(store, key, attachments);
    }
    if (editingState) {
      store.setQueuedComposerEditState(sessionRef, editingState);
    }
    if (optimisticSteerMessage) {
      removeOptimisticQueuedUserMessage(store, sessionRef, optimisticSteerMessage.id);
    }
    return store.withError(error);
  }
}

export async function setSessionModel(
  store: AppStoreInternals,
  target: WorkspaceSessionTarget,
  provider: string,
  modelId: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = toSessionRef(target);
  const key = sessionKey(sessionRef);

  return store.withErrorHandling(async () => {
    await store.driver.setSessionModel(sessionRef, { provider, modelId });
    syncSessionConfig(store, key, { provider, modelId });
    return finishComposerCommand(store, sessionRef, key, `模型已设置为 ${provider}:${modelId}`);
  });
}

export async function setSessionThinkingLevel(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  thinkingLevel: string,
): Promise<DesktopAppState> {
  await store.initialize();
  const key = sessionKey(sessionRef);
  return store.withErrorHandling(async () => {
    await store.driver.setSessionThinkingLevel(sessionRef, thinkingLevel);
    syncSessionConfig(store, key, { thinkingLevel });
    return finishComposerCommand(store, sessionRef, key, `推理强度已设置为 ${thinkingLevel}`);
  });
}

export async function runDevelopmentOrchestration(store: AppStoreInternals): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.withError("请选择一个会话后再运行开发编排。");
  }
  const preset = resolveActiveDevelopmentPreset(store);
  if (!preset) {
    return store.withError("请先启用开发模式并选择一个开发方案。");
  }
  const key = sessionKey(sessionRef);
  if (!store.sessionState.loadedTranscriptKeys.has(key)) {
    await store.ensureSessionReady(sessionRef);
  }
  const text = latestUserTextFromTranscript(store.sessionState.transcriptCache.get(key) ?? []);
  if (!text) {
    return store.withError("当前会话还没有可用于编排的用户消息。");
  }
  const developmentMode = resolveDevelopmentModeSendOptions(preset, text, { realSubagentsWillRun: true });
  const mainSend = sendMessageToSession(store, sessionRef, text, [], developmentMode);
  // Launch subagents in parallel with the main coordinator send. Results will be
  // injected into the main session once the subagents finish.
  void launchDevelopmentSubagentSessions(store, sessionRef, text, [], preset).catch((error) => {
    void store.withError(error);
  });
  await mainSend;
  return store.refreshState({
    clearLastError: true,
    markSelectedSessionViewed: false,
    hydrateSelectedSession: false,
  });
}

export async function cancelCurrentRun(store: AppStoreInternals): Promise<DesktopAppState> {
  await store.initialize();
  const sessionRef = store.selectedSessionRef();
  if (!sessionRef) {
    return store.emit();
  }

  return store.withErrorHandling(async () => {
    await store.driver.cancelCurrentRun(sessionRef);
    clearActiveAssistantMessage(store.sessionState.activeAssistantMessageBySession, sessionRef);
    store.sessionState.sessionErrorsBySession.delete(sessionKey(sessionRef));
    store.state = {
      ...store.state,
      lastError: undefined,
      revision: store.state.revision + 1,
    };
    store.schedulePersistUiState();
    return store.emit();
  });
}

/* ── Internal helpers ───────────────────────────────────── */

function resolveActiveDevelopmentPreset(store: AppStoreInternals): DevelopmentModePreset | undefined {
  if (store.state.appMode !== "development" || !store.state.activeDevelopmentModePresetId) {
    return undefined;
  }
  return store.state.developmentModePresets.find((entry) => entry.id === store.state.activeDevelopmentModePresetId);
}

function resolveDevelopmentModeSendOptions(
  preset: DevelopmentModePreset | undefined,
  text: string,
  options: { readonly realSubagentsWillRun?: boolean } = {},
): {
  readonly driverText?: string;
  readonly model?: { readonly provider: string; readonly modelId: string; readonly thinkingLevel?: string };
} {
  if (!preset) {
    return {};
  }
  return {
    driverText: buildDevelopmentModePrompt(text, preset, { realSubagentsWillRun: options.realSubagentsWillRun ?? false }),
    ...(preset.config.mainAgent.provider && preset.config.mainAgent.modelId ? { model: preset.config.mainAgent } : {}),
  };
}

/**
 * Run development subagents as real parallel model calls while keeping their
 * temporary sessions out of the normal GUI event/render path.  The expensive UI
 * path is intentionally avoided here: no ensureSessionReady(), no subscription,
 * no optimistic transcript cache for temporary sessions, no per-subagent emit().
 * Results are collected from the driver transcript and injected into the main
 * conversation as one assistant message so the right-side workflow parser can
 * still read [Architect]/[Developer]/... sections.
 */
async function launchDevelopmentSubagentSessions(
  store: AppStoreInternals,
  mainSessionRef: SessionRef,
  text: string,
  attachments: readonly ComposerAttachment[],
  preset: DevelopmentModePreset,
): Promise<void> {
  const activeSubagents = preset.config.subagents.filter((agent) => agent.enabled !== false);
  if (activeSubagents.length === 0) return;

  const workspaceRef = store.workspaceRefFromState(mainSessionRef.workspaceId);
  if (!workspaceRef) return;

  const sessionAttachments = toSessionAttachments(attachments);
  const results = await Promise.allSettled(
    activeSubagents.map(async (agent) => {
      const prompt = buildDevelopmentSubagentPrompt(text, preset, agent);
      // createTransientSession skips extension binding, catalog writes,
      // and persistent session files.  Subagents get their model from the
      // preset config, not the default workspace settings — skip
      // buildCreateSessionOptions to avoid unnecessary I/O.
      const session = await store.driver.createTransientSession(workspaceRef, {
        title: `编排·${agent.name || agent.id}`,
        ...(agent.model.provider && agent.model.modelId
          ? { initialModel: { provider: agent.model.provider, modelId: agent.model.modelId } }
          : {}),
        ...(agent.model.thinkingLevel ? { initialThinkingLevel: agent.model.thinkingLevel } : {}),
      });

      try {
        await store.driver.sendUserMessage(session.ref, {
          text: prompt,
          attachments: sessionAttachments,
        });
        const transcript = await store.driver.getTranscript(session.ref);
        const responseText = transcript
          .filter((entry) => entry.kind === "message" && entry.role === "assistant")
          .map((entry) => entry.text)
          .filter(Boolean)
          .join("\n\n");

        return {
          role: agent.role ?? agent.name ?? agent.id,
          label: agent.name || agent.id,
          text: responseText,
        };
      } finally {
        // Transient sessions have no catalog entries, but we still need to
        // clean up the runtime record from the driver's in-memory map.
        try {
          await store.driver.deleteSession(session.ref);
        } catch {
          // Ignore cleanup errors.
        }
      }
    }),
  );

  const sections = results.map((result, index) => {
    const agent = activeSubagents[index];
    const rawRole = agent?.role ?? agent?.name ?? agent?.id ?? "Subagent";
    const roleLabel = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);
    if (result.status === "fulfilled") {
      const body = result.value.text.trim() || "（无输出）";
      return `[${roleLabel}]\n${body}`;
    }
    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return `[${roleLabel}]\n运行失败：${message}`;
  });

  if (sections.length === 0) return;

  const mainKey = sessionKey(mainSessionRef);
  const mainTranscript = store.sessionState.transcriptCache.get(mainKey) ?? [];
  mainTranscript.push(makeTranscriptMessage("assistant", sections.join("\n\n")));
  store.sessionState.transcriptCache.set(mainKey, mainTranscript);
  store.publishSelectedTranscriptFor(mainSessionRef);
  store.persistTranscriptCacheForSession(mainSessionRef);
}

export async function sendMessageToSession(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  text: string,
  attachments: readonly ComposerAttachment[],
  options: {
    readonly rollbackOptimisticMessageOnError?: boolean;
    readonly driverText?: string;
    readonly model?: { readonly provider: string; readonly modelId: string; readonly thinkingLevel?: string };
  } = {},
): Promise<void> {
  const key = sessionKey(sessionRef);
  const transcriptWasLoaded = store.sessionState.loadedTranscriptKeys.has(key);
  const rollbackOptimisticMessageOnError = options.rollbackOptimisticMessageOnError ?? true;
  const userMessage = appendUserMessage(
    store.sessionState.transcriptCache,
    sessionRef,
    text,
    toTranscriptAttachments(attachments),
  );
  store.publishTranscriptMessagePatch(sessionRef, userMessage);
  if (transcriptWasLoaded) {
    store.persistTranscriptCacheForSession(sessionRef);
  }
  await store.ensureSessionSubscription(sessionRef);
  if (store.sessionFromState(sessionRef)?.archivedAt) {
    await store.driver.unarchiveSession(sessionRef);
  }
  clearActiveAssistantMessage(store.sessionState.activeAssistantMessageBySession, sessionRef);
  store.sessionState.sessionErrorsBySession.delete(key);
  store.sessionState.composerDraftsBySession.delete(key);
  store.sessionState.composerAttachmentsBySession.delete(key);
  persistComposerAttachmentsInBackground(store, key, []);
  try {
    if (options.model?.provider && options.model.modelId) {
      await store.driver.setSessionModel(sessionRef, { provider: options.model.provider, modelId: options.model.modelId });
      syncSessionConfig(store, key, { provider: options.model.provider, modelId: options.model.modelId });
      if (options.model.thinkingLevel) {
        await store.driver.setSessionThinkingLevel(sessionRef, options.model.thinkingLevel);
        syncSessionConfig(store, key, { thinkingLevel: options.model.thinkingLevel });
      }
    }
    await store.driver.sendUserMessage(sessionRef, {
      text: options.driverText ?? text,
      attachments: toSessionAttachments(attachments),
    });
  } catch (error) {
    if (rollbackOptimisticMessageOnError) {
      const transcript = store.sessionState.transcriptCache.get(key) ?? [];
      store.sessionState.transcriptCache.set(
        key,
        transcript.filter((message) => message.id !== userMessage.id),
      );
      store.publishSelectedTranscriptFor(sessionRef);
      store.persistTranscriptCacheForSession(sessionRef);
    }
    throw error;
  }
}

async function handleBackgroundSendFailure(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  options: {
    readonly error: unknown;
    readonly draftToRestore: string;
    readonly attachmentsToRestore: readonly ComposerAttachment[];
    readonly editStateToRestore: ReturnType<AppStoreInternals["getQueuedComposerEditState"]>;
  },
): Promise<void> {
  const key = sessionKey(sessionRef);
  if (options.draftToRestore && !store.sessionState.composerDraftsBySession.has(key)) {
    store.sessionState.composerDraftsBySession.set(key, options.draftToRestore);
  }
  if (options.attachmentsToRestore.length > 0 && !store.sessionState.composerAttachmentsBySession.has(key)) {
    store.sessionState.composerAttachmentsBySession.set(key, cloneComposerAttachments(options.attachmentsToRestore));
    persistComposerAttachmentsInBackground(store, key, options.attachmentsToRestore);
  }
  if (options.editStateToRestore && !store.getQueuedComposerEditState(sessionRef)) {
    store.setQueuedComposerEditState(sessionRef, options.editStateToRestore);
  }

  const message = options.error instanceof Error ? options.error.message : String(options.error);
  store.sessionState.sessionErrorsBySession.set(key, message);
  const isSelected = store.state.selectedWorkspaceId === sessionRef.workspaceId && store.state.selectedSessionId === sessionRef.sessionId;
  store.state = {
    ...store.state,
    ...(isSelected ? { lastError: message } : {}),
    revision: store.state.revision + 1,
  };
  await store.persistUiState();
  store.emit();
}

function buildQueuedComposerMessage(options: {
  readonly text: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly mode: "steer" | "followUp";
  readonly existing?: QueuedComposerMessage;
}): QueuedComposerMessage {
  const timestamp = new Date().toISOString();
  return {
    id: options.existing?.id ?? randomUUID(),
    text: options.text,
    mode: options.mode,
    attachments: cloneComposerAttachments(options.attachments),
    createdAt: options.existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function replaceQueuedComposerMessage(
  messages: readonly QueuedComposerMessage[],
  messageId: string,
  replacement: QueuedComposerMessage,
): QueuedComposerMessage[] {
  return messages.map((message) => (message.id === messageId ? replacement : message));
}

function removeOptimisticQueuedUserMessage(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  messageId: string,
): void {
  const key = sessionKey(sessionRef);
  const transcript = store.sessionState.transcriptCache.get(key) ?? [];
  store.sessionState.transcriptCache.set(
    key,
    transcript.filter((message) => message.id !== messageId),
  );
  store.publishSelectedTranscriptFor(sessionRef);
  store.persistTranscriptCacheForSession(sessionRef);
}

function persistComposerAttachmentsInBackground(
  store: AppStoreInternals,
  key: string,
  attachments: readonly ComposerAttachment[],
): void {
  const cloned = cloneComposerAttachments(attachments);
  void store.attachmentStore.write(key, cloned).catch((error: unknown) => {
    console.warn("Failed to persist composer attachments", error);
  });
  store.schedulePersistUiState();
}

/** Eagerly merge config fields so finishComposerCommand sees them before the async sessionUpdated event arrives. */
function syncSessionConfig(store: AppStoreInternals, key: string, patch: Partial<SessionConfig>): void {
  const current = store.sessionState.sessionConfigBySession.get(key) ?? {};
  store.sessionState.sessionConfigBySession.set(key, { ...current, ...patch });
}

async function runComposerCommand(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  commandText: string,
): Promise<DesktopAppState | undefined> {
  const parsed = parseComposerCommand(commandText);
  if (!parsed) {
    const message = incompleteComposerCommandMessage(commandText);
    if (message) {
      return store.withError(message);
    }
    return undefined;
  }

  const key = sessionKey(sessionRef);

  if (parsed.type === "model") {
    await store.driver.setSessionModel(sessionRef, {
      provider: parsed.provider,
      modelId: parsed.modelId,
    });
    syncSessionConfig(store, key, { provider: parsed.provider, modelId: parsed.modelId });
    return finishComposerCommand(store, sessionRef, key, `模型已设置为 ${parsed.provider}:${parsed.modelId}`);
  }

  if (parsed.type === "thinking") {
    await store.driver.setSessionThinkingLevel(sessionRef, parsed.thinkingLevel);
    syncSessionConfig(store, key, { thinkingLevel: parsed.thinkingLevel });
    return finishComposerCommand(store, sessionRef, key, `推理强度已设置为 ${parsed.thinkingLevel}`);
  }

  if (parsed.type === "status") {
    return finishComposerCommand(
      store,
      sessionRef,
      key,
      formatSessionConfigStatus(store.sessionState.sessionConfigBySession.get(key)),
    );
  }

  if (parsed.type === "session") {
    const workspace = store.state.workspaces.find((entry) => entry.id === sessionRef.workspaceId);
    const session = workspace?.sessions.find((entry) => entry.id === sessionRef.sessionId);
    const parts = [
      `会话 ${session?.title ?? sessionRef.sessionId}`,
      `ID ${sessionRef.sessionId}`,
      workspace ? `工作区 ${workspace.name}` : undefined,
      session ? `状态 ${session.status}` : undefined,
    ].filter(Boolean);
    return finishComposerCommand(store, sessionRef, key, parts.join(" · "));
  }

  if (parsed.type === "name") {
    store.clearPendingAutoTitle(sessionRef);
    await store.driver.renameSession(sessionRef, parsed.title);
    return finishComposerCommand(store, sessionRef, key, `会话已重命名为 ${parsed.title}`);
  }

  if (parsed.type === "compact") {
    await store.driver.compactSession(sessionRef, parsed.customInstructions);
    await store.reloadTranscriptFromDriver(sessionRef);
    return finishComposerCommand(store, sessionRef, key, "会话上下文已压缩");
  }

  if (parsed.type === "reload") {
    store.clearExtensionUiForSession(sessionRef);
    await store.driver.reloadSession(sessionRef);
    await store.refreshSessionCommandsFor(sessionRef);
    return finishComposerCommand(store, sessionRef, key, "会话资源已重新加载");
  }

  return store.withError(`不支持的斜杠命令：${commandText}`);
}

function appendLocalActivity(store: AppStoreInternals, sessionRef: SessionRef, label: string): void {
  const key = sessionKey(sessionRef);
  const transcript = [...(store.sessionState.transcriptCache.get(key) ?? [])];
  transcript.push(makeActivityItem(label));
  store.sessionState.transcriptCache.set(key, transcript);
  store.persistTranscriptCacheForSession(sessionRef);
}

function finishComposerCommand(
  store: AppStoreInternals,
  sessionRef: SessionRef,
  key: string,
  label: string,
): DesktopAppState {
  store.sessionState.composerDraftsBySession.delete(key);
  store.sessionState.composerAttachmentsBySession.delete(key);
  appendLocalActivity(store, sessionRef, label);
  const transcript = store.sessionState.transcriptCache.get(key) ?? [];
  const preview = previewFromTranscript(transcript);
  store.state = {
    ...store.state,
    workspaces: store.state.workspaces.map((workspace) =>
      workspace.id === sessionRef.workspaceId
        ? {
            ...workspace,
            sessions: workspace.sessions.map((session) =>
              session.id === sessionRef.sessionId
                ? {
                    ...session,
                    preview: preview ?? session.preview,
                    config: store.sessionState.sessionConfigBySession.get(key),
                  }
                : session,
            ),
          }
        : workspace,
    ),
    composerDraft: "",
    composerDraftSyncSource: "command",
    composerDraftSyncNonce: store.allocateComposerDraftSyncNonce(),
    composerAttachments: [],
    lastError: undefined,
    revision: store.state.revision + 1,
  };
  store.schedulePersistUiState();
  const snapshot = store.emit();
  store.publishSelectedTranscriptFor(sessionRef);
  return snapshot;
}
