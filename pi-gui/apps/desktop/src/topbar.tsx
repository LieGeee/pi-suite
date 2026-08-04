import type { MouseEvent as ReactMouseEvent, Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppView, DesktopAppState, SessionRecord, WorkspaceRecord, WorktreeRecord } from "./desktop-state";
import { DiffIcon, FolderIcon, RefreshIcon, TerminalIcon } from "./icons";
import { getDesktopShortcutLabel, type PiDesktopApi } from "./ipc";
import type { WorkspaceMenuState } from "./hooks/use-workspace-menu";

interface TopbarProps {
  readonly activeView: AppView;
  readonly rootWorkspace: WorkspaceRecord | undefined;
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedSession: SessionRecord | undefined;
  readonly selectedSessionTitle: string | undefined;
  readonly selectedWorktree: WorktreeRecord | undefined;
  readonly activeWorktrees: readonly WorktreeRecord[];
  readonly workspaces: readonly WorkspaceRecord[];
  readonly wsMenu: WorkspaceMenuState;
  readonly api: PiDesktopApi;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
  readonly updateSnapshot: (
    api: PiDesktopApi,
    setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
    action: () => Promise<DesktopAppState>,
  ) => Promise<DesktopAppState>;
  readonly terminalAvailable: boolean;
  readonly terminalVisible: boolean;
  readonly onToggleTerminal: () => void;
  readonly showDiffPanel: boolean;
  readonly onToggleDiffPanel: () => void;
  readonly onRefreshConversation: () => void;
  readonly onRenameSession: (target: { workspaceId: string; sessionId: string }, title: string) => void;
}

export function Topbar(props: TopbarProps) {
  const {
    activeView,
    rootWorkspace,
    selectedWorkspace,
    selectedSession,
    selectedSessionTitle,
    selectedWorktree,
    activeWorktrees,
    workspaces,
    wsMenu,
    api,
    setSnapshot,
    updateSnapshot,
    terminalAvailable,
    terminalVisible,
    onToggleTerminal,
    showDiffPanel,
    onToggleDiffPanel,
    onRefreshConversation,
    onRenameSession,
  } = props;
  const terminalShortcut = getDesktopShortcutLabel(api.platform, "J");
  const diffShortcut = getDesktopShortcutLabel(api.platform, "D");

  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  const beginRename = () => {
    if (!selectedWorkspace || !selectedSession) return;
    setRenameDraft(selectedSessionTitle ?? selectedSession.title ?? "");
    setRenaming(true);
  };

  const commitRename = () => {
    if (!selectedWorkspace || !selectedSession) return;
    const title = renameDraft.trim();
    setRenaming(false);
    if (title && title !== (selectedSessionTitle ?? selectedSession.title)) {
      onRenameSession(
        { workspaceId: selectedWorkspace.id, sessionId: selectedSession.id },
        title,
      );
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest(".topbar__actions")) {
      return;
    }

    void api.toggleWindowMaximize();
  };

  return (
    <header className="topbar" data-testid="topbar" onDoubleClick={handleDoubleClick}>
      <div className="topbar__title">
        <span className="topbar__workspace">
          {rootWorkspace ? rootWorkspace.name : "先打开一个文件夹开始"}
        </span>
        {selectedWorkspace && activeView === "threads" ? (
          <>
            <span className="topbar__separator">/</span>
            <div className="environment-picker" ref={wsMenu.environmentMenuRef}>
              <button
                aria-expanded={wsMenu.environmentMenuOpen}
                aria-haspopup="menu"
                className="environment-picker__button"
                type="button"
                onClick={() => wsMenu.setEnvironmentMenuOpen((current) => !current)}
              >
                {selectedWorkspace.kind === "worktree" ? selectedWorktree?.name ?? selectedWorkspace.name : "本地"}
              </button>
              {wsMenu.environmentMenuOpen && rootWorkspace ? (
                <div className="workspace-menu environment-picker__menu">
                  <button
                    className="workspace-menu__item"
                    type="button"
                    onClick={() => wsMenu.selectWorkspace(rootWorkspace.id)}
                  >
                    本地
                  </button>
                  {activeWorktrees.map((worktree) => {
                    const linkedWorkspace = workspaces.find(
                      (workspace) => workspace.id === worktree.linkedWorkspaceId,
                    );
                    const worktreeSelectable = Boolean(linkedWorkspace) && worktree.status === "ready";
                    return (
                      <button
                        className="workspace-menu__item"
                        key={worktree.id}
                        type="button"
                        disabled={!worktreeSelectable}
                        onClick={() => {
                          if (worktreeSelectable && linkedWorkspace) {
                            wsMenu.selectWorkspace(linkedWorkspace.id);
                          }
                        }}
                      >
                        {worktree.name}
                        {!worktreeSelectable ? ` (${worktree.status !== "ready" ? worktree.status : "不可用"})` : ""}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {selectedWorkspace && activeView === "threads" && selectedSession ? (
          <>
            <span className="topbar__separator">/</span>
            {renaming ? (
              <input
                aria-label="重命名会话"
                className="topbar__rename-input"
                ref={renameInputRef}
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename();
                  else if (event.key === "Escape") setRenaming(false);
                }}
              />
            ) : (
              <button
                className="topbar__session"
                title="双击重命名会话"
                type="button"
                onDoubleClick={beginRename}
              >
                {selectedSessionTitle ?? selectedSession.title}
              </button>
            )}
          </>
        ) : activeView === "new-thread" && rootWorkspace ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">新对话</span>
          </>
        ) : null}
      </div>

      <div className="topbar__actions">
        <div className="shortcut-tooltip-wrap topbar__tooltip-wrap">
          <button
            aria-label="切换终端"
            className={`icon-button topbar__icon ${terminalVisible ? "icon-button--active" : ""}`}
            type="button"
            disabled={!terminalAvailable}
            onClick={onToggleTerminal}
          >
            <TerminalIcon />
          </button>
          <span className="shortcut-tooltip topbar__tooltip" role="tooltip">
            <span>切换终端</span>
            <kbd>{terminalShortcut}</kbd>
          </span>
        </div>
        <div className="shortcut-tooltip-wrap topbar__tooltip-wrap">
          <button
            aria-label="切换改动面板"
            className={`icon-button topbar__icon ${showDiffPanel ? "icon-button--active" : ""}`}
            type="button"
            onClick={onToggleDiffPanel}
          >
            <DiffIcon />
          </button>
          <span className="shortcut-tooltip topbar__tooltip" role="tooltip">
            <span>切换改动面板</span>
            <kbd>{diffShortcut}</kbd>
          </span>
        </div>
        {activeView === "threads" && selectedWorkspace && selectedSession ? (
          <div className="shortcut-tooltip-wrap topbar__tooltip-wrap">
            <button
              aria-label="刷新对话"
              className="icon-button topbar__icon"
              type="button"
              onClick={onRefreshConversation}
            >
              <RefreshIcon />
            </button>
            <span className="shortcut-tooltip topbar__tooltip" role="tooltip">刷新对话</span>
          </div>
        ) : null}
        <button
          aria-label="添加文件夹"
          className="icon-button topbar__icon"
          type="button"
          onClick={() => {
            void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
          }}
        >
          <FolderIcon />
        </button>
      </div>
    </header>
  );
}
