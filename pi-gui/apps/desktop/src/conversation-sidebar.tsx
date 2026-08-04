import { useEffect, useRef, useState, type DragEvent } from "react";
import type {
  ConversationGroup,
  ConversationSessionRef,
  SessionRecord,
  WorkspaceRecord,
} from "./desktop-state";
import type { ConversationListEntry } from "./conversation-collections";
import { ChevronDownIcon, PlusIcon } from "./icons";

const CONVERSATION_DRAG_TYPE = "application/x-pi-conversation";

interface ConversationSidebarProps {
  readonly recentConversations: readonly ConversationListEntry[];
  readonly conversationGroups: readonly ConversationGroup[];
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedSession: SessionRecord | undefined;
  readonly onSelectSession: (target: ConversationSessionRef) => void;
  readonly onCreateConversationGroup: (name: string) => void;
  readonly onRenameConversationGroup: (groupId: string, name: string) => void;
  readonly onDeleteConversationGroup: (groupId: string) => void;
  readonly onAssignConversationToGroup: (target: ConversationSessionRef, groupId?: string) => void;
}

export function ConversationSidebar({
  recentConversations,
  conversationGroups,
  selectedWorkspace,
  selectedSession,
  onSelectSession,
  onCreateConversationGroup,
  onRenameConversationGroup,
  onDeleteConversationGroup,
  onAssignConversationToGroup,
}: ConversationSidebarProps) {
  const [search, setSearch] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const query = search.trim().toLocaleLowerCase("zh-CN");
  const visibleRecent = recentConversations.filter((entry) =>
    !query || [entry.session.title, entry.session.preview, entry.workspaceName]
      .some((value) => value.toLocaleLowerCase("zh-CN").includes(query)),
  );

  return (
    <div className="sidebar__section sidebar__conversation-panel" data-testid="conversation-sidebar">
      <div className="section__head">
        <span>最近对话</span>
        <button
          aria-label="新建对话分组"
          className="icon-button"
          type="button"
          onClick={() => setGroupFormOpen((open) => !open)}
        >
          <PlusIcon />
        </button>
      </div>
      <label className="sidebar__search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="搜索对话"
          value={search}
          placeholder="搜索标题、内容或项目"
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </label>
      {groupFormOpen ? (
        <form
          className="conversation-group-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!groupDraft.trim()) return;
            onCreateConversationGroup(groupDraft);
            setGroupDraft("");
            setGroupFormOpen(false);
          }}
        >
          <input
            aria-label="对话分组名称"
            autoFocus
            value={groupDraft}
            placeholder="分组名称"
            onChange={(event) => setGroupDraft(event.currentTarget.value)}
          />
          <button className="button button--primary" type="submit">添加分组</button>
        </form>
      ) : null}

      <div className="sidebar__conversation-list" data-testid="recent-conversations">
        <div className="sidebar__subhead">最近</div>
        {visibleRecent.map((entry) => (
          <RecentConversationRow
            key={`${entry.workspaceId}:${entry.session.id}`}
            entry={entry}
            active={entry.workspaceId === selectedWorkspace?.id && entry.session.id === selectedSession?.id}
            conversationGroups={conversationGroups}
            onSelect={() => onSelectSession({ workspaceId: entry.workspaceId, sessionId: entry.session.id })}
            onAssign={(groupId) => onAssignConversationToGroup({
              workspaceId: entry.workspaceId,
              sessionId: entry.session.id,
            }, groupId)}
          />
        ))}
        {visibleRecent.length === 0 ? <div className="sidebar__empty-copy">没有匹配的对话</div> : null}

        <div className="sidebar__subhead sidebar__subhead--groups">
          <span>对话分组</span>
          <span className="sidebar__subhead-hint">跨项目</span>
        </div>
        {conversationGroups.map((group) => (
          <ConversationGroupRow
            key={group.id}
            group={group}
            recentConversations={recentConversations}
            selectedWorkspace={selectedWorkspace}
            selectedSession={selectedSession}
            onSelectSession={onSelectSession}
            onRename={(name) => onRenameConversationGroup(group.id, name)}
            onDelete={() => onDeleteConversationGroup(group.id)}
            onAssignConversation={(target) => onAssignConversationToGroup(target, group.id)}
          />
        ))}
        {conversationGroups.length === 0 ? (
          <div className="sidebar__empty-copy">新建一个分组，可整理来自不同项目的对话。</div>
        ) : null}
      </div>
    </div>
  );
}

function RecentConversationRow({
  entry,
  active,
  conversationGroups,
  onSelect,
  onAssign,
}: {
  readonly entry: ConversationListEntry;
  readonly active: boolean;
  readonly conversationGroups: readonly ConversationGroup[];
  readonly onSelect: () => void;
  readonly onAssign: (groupId?: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const currentGroup = conversationGroups.find((group) =>
    group.sessions.some((ref) => ref.workspaceId === entry.workspaceId && ref.sessionId === entry.session.id),
  );
  const indicator = entry.session.status === "running"
    ? "running"
    : entry.session.status === "failed"
      ? "failed"
      : entry.session.hasUnseenUpdate
        ? "unseen"
        : "none";

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeMenu = (event: MouseEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [menuOpen]);

  const target = { workspaceId: entry.workspaceId, sessionId: entry.session.id };
  return (
    <div
      className={`session-row conversation-row ${active ? "session-row--active" : ""}`}
      data-sidebar-indicator={indicator}
      data-session-id={entry.session.id}
    >
      <button className="session-row__select" type="button" onClick={onSelect}>
        <span className="session-row__leading" aria-hidden="true">
          {indicator === "running" ? <span className="session-row__status session-row__status--running" /> : null}
          {indicator === "unseen" ? <span className="session-row__status session-row__status--unseen" /> : null}
          {indicator === "failed" ? <span className="session-row__status session-row__status--failed" /> : null}
        </span>
        <span className="session-row__body">
          <span className="session-row__title-line"><span className="session-row__title">{entry.session.title}</span></span>
          <span className="session-row__preview">
            {entry.workspaceName}{entry.session.preview ? ` · ${entry.session.preview}` : ""}
          </span>
        </span>
      </button>
      <span className="conversation-row__actions" ref={menuRef}>
        <button
          aria-label={`拖动对话\u201c${entry.session.title}\u201d到分组`}
          className="conversation-row__drag-handle"
          draggable
          type="button"
          title="拖动到分组"
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(CONVERSATION_DRAG_TYPE, JSON.stringify(target));
          }}
        >
          ⋮⋮
        </button>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="归入分组"
          className="conversation-row__assign"
          type="button"
          title={currentGroup ? `当前分组\uFF1A${currentGroup.name}` : "归入分组"}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          +
        </button>
        {menuOpen ? (
          <div className="session-menu conversation-row__menu" role="menu">
            {conversationGroups.map((group) => (
              <button
                className="session-menu__item"
                key={group.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAssign(group.id);
                }}
              >
                {group.name}{group.id === currentGroup?.id ? "(当前)" : ""}
              </button>
            ))}
            {currentGroup ? (
              <button
                className="session-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAssign(undefined);
                }}
              >
                移出分组
              </button>
            ) : null}
            {conversationGroups.length === 0 ? (
              <div className="sidebar__empty-copy">请先新建对话分组</div>
            ) : null}
          </div>
        ) : null}
      </span>
    </div>
  );
}

function ConversationGroupRow({
  group,
  recentConversations,
  selectedWorkspace,
  selectedSession,
  onSelectSession,
  onRename,
  onDelete,
  onAssignConversation,
}: {
  readonly group: ConversationGroup;
  readonly recentConversations: readonly ConversationListEntry[];
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedSession: SessionRecord | undefined;
  readonly onSelectSession: (target: ConversationSessionRef) => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
  readonly onAssignConversation: (target: ConversationSessionRef) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const byKey = new Map(recentConversations.map((entry) => [conversationKey({
    workspaceId: entry.workspaceId,
    sessionId: entry.session.id,
  }), entry] as const));
  const entries = group.sessions
    .map((ref) => byKey.get(conversationKey(ref)))
    .filter((entry): entry is ConversationListEntry => Boolean(entry));

  const acceptConversationDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CONVERSATION_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  return (
    <div
      className={`conversation-group ${dragOver ? "conversation-group--drop-target" : ""}`}
      data-testid="conversation-group"
      onDragEnter={acceptConversationDrop}
      onDragOver={acceptConversationDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const target = parseConversationDragData(event.dataTransfer.getData(CONVERSATION_DRAG_TYPE));
        if (target) onAssignConversation(target);
      }}
    >
      <div className="conversation-group__head">
        <button aria-expanded={expanded} className="conversation-group__toggle" type="button" onClick={() => setExpanded((value) => !value)}>
          <span className={`conversation-group__chevron ${expanded ? "" : "conversation-group__chevron--collapsed"}`}>
            <ChevronDownIcon />
          </span>
          <span>{group.name}</span>
          <small>{entries.length}</small>
        </button>
        <button
          className="icon-button conversation-group__menu"
          aria-expanded={editing}
          aria-label={`编辑分组\u201c${group.name}\u201d`}
          type="button"
          onClick={() => setEditing((value) => !value)}
        >
          ...
        </button>
      </div>
      {editing ? (
        <div className="conversation-group__actions">
          <input aria-label={`重命名分组\u201c${group.name}\u201d`} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
          <button type="button" onClick={() => { if (draft.trim()) onRename(draft); setEditing(false); }}>保存</button>
          <button type="button" onClick={onDelete}>删除</button>
        </div>
      ) : null}
      {expanded ? entries.map((entry) => (
        <button
          className={`conversation-group__row ${entry.workspaceId === selectedWorkspace?.id && entry.session.id === selectedSession?.id ? "conversation-group__row--active" : ""}`}
          key={`${entry.workspaceId}:${entry.session.id}`}
          type="button"
          onClick={() => onSelectSession({ workspaceId: entry.workspaceId, sessionId: entry.session.id })}
        >
          <span>{entry.session.title}</span>
          <small>{entry.workspaceName}</small>
        </button>
      )) : null}
    </div>
  );
}

function parseConversationDragData(value: string): ConversationSessionRef | undefined {
  try {
    const target = JSON.parse(value) as Partial<ConversationSessionRef>;
    return typeof target.workspaceId === "string" && typeof target.sessionId === "string"
      ? { workspaceId: target.workspaceId, sessionId: target.sessionId }
      : undefined;
  } catch {
    return undefined;
  }
}

function conversationKey(target: ConversationSessionRef): string {
  return `${target.workspaceId}\u0000${target.sessionId}`;
}
