import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type {
  AppView,
  ConversationGroup,
  ConversationSessionRef,
  SessionCategoryNode,
  SessionCategoriesByWorkspace,
  SessionRecord,
  SidebarTab,
  WorkspaceRecord,
  WorktreeRecord,
  WorkspaceSessionTarget,
} from "./desktop-state";
import { ArchiveIcon, ChevronDownIcon, ExtensionIcon, FolderIcon, PlusIcon, RestoreIcon, SettingsIcon, SkillIcon, WorktreeIcon } from "./icons";
import type { PiDesktopApi } from "./ipc";
import { formatRelativeTime, titleCase } from "./string-utils";
import type { WorkspaceMenuState } from "./hooks/use-workspace-menu";
import type { ThreadGroup, ThreadListEntry } from "./thread-groups";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { DesktopAppState } from "./desktop-state";
import type { SettingsSection } from "./settings-view";
import { extensionSourceSummary } from "./extension-display";
import { ConversationSidebar } from "./conversation-sidebar";
import type { ConversationListEntry } from "./conversation-collections";

interface SidebarProps {
  readonly activeView: AppView;
  readonly sidebarTab: SidebarTab;
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedSession: SessionRecord | undefined;
  readonly visibleWorkspaces: readonly WorkspaceRecord[];
  readonly threadGroups: readonly ThreadGroup[];
  readonly recentConversations: readonly ConversationListEntry[];
  readonly conversationGroups: readonly ConversationGroup[];
  readonly linkedWorktreeByWorkspaceId: ReadonlyMap<string, WorktreeRecord>;
  readonly sessionCategoriesByWorkspace: SessionCategoriesByWorkspace;
  readonly wsMenu: WorkspaceMenuState;
  readonly api: PiDesktopApi;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
  readonly updateSnapshot: (
    api: PiDesktopApi,
    setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
    action: () => Promise<DesktopAppState>,
  ) => Promise<DesktopAppState>;
  readonly onNewThread: () => void;
  readonly onSetActiveView: (view: AppView) => void;
  readonly onSetSidebarTab: (tab: SidebarTab) => void;
  readonly onCreateConversationGroup: (name: string) => void;
  readonly onRenameConversationGroup: (groupId: string, name: string) => void;
  readonly onDeleteConversationGroup: (groupId: string) => void;
  readonly onAssignConversationToGroup: (target: ConversationSessionRef, groupId?: string) => void;
  readonly onOpenSkills: (workspaceId?: string) => void;
  readonly onOpenExtensions: (workspaceId?: string) => void;
  readonly onOpenSettings: (workspaceId?: string, section?: SettingsSection) => void;
  readonly rootWorkspaceOptions: readonly WorkspaceRecord[];
  readonly settingsSection: SettingsSection;
  readonly settingsWorkspace: WorkspaceRecord | undefined;
  readonly skillsWorkspace: WorkspaceRecord | undefined;
  readonly extensionsWorkspace: WorkspaceRecord | undefined;
  readonly settingsNav: readonly { readonly id: SettingsSection; readonly label: string }[];
  readonly skillsRuntime?: RuntimeSnapshot;
  readonly extensionsRuntime?: RuntimeSnapshot;
  readonly selectedSkillPath?: string;
  readonly selectedExtensionPath?: string;
  readonly onSelectSettingsSection: (section: SettingsSection) => void;
  readonly onSelectSettingsWorkspace: (workspaceId: string) => void;
  readonly onSelectSkillsWorkspace: (workspaceId: string) => void;
  readonly onSelectExtensionsWorkspace: (workspaceId: string) => void;
  readonly onSelectSkillPath: (filePath: string) => void;
  readonly onSelectExtensionPath: (path: string) => void;
  readonly onArchiveSession: (target: { workspaceId: string; sessionId: string }) => void;
  readonly onRenameSession: (target: { workspaceId: string; sessionId: string }, title: string) => void;
  readonly onSelectSession: (target: { workspaceId: string; sessionId: string }) => void;
  readonly onUnarchiveSession: (target: { workspaceId: string; sessionId: string }) => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    activeView,
    sidebarTab,
    selectedWorkspace,
    selectedSession,
    visibleWorkspaces,
    threadGroups,
    recentConversations,
    conversationGroups,
    linkedWorktreeByWorkspaceId,
    sessionCategoriesByWorkspace,
    wsMenu,
    api,
    setSnapshot,
    updateSnapshot,
    onNewThread,
    onSetActiveView,
    onSetSidebarTab,
    onCreateConversationGroup,
    onRenameConversationGroup,
    onDeleteConversationGroup,
    onAssignConversationToGroup,
    onOpenSkills,
    onOpenExtensions,
    onOpenSettings,
    rootWorkspaceOptions,
    settingsSection,
    settingsWorkspace,
    skillsWorkspace,
    extensionsWorkspace,
    settingsNav,
    skillsRuntime,
    extensionsRuntime,
    selectedSkillPath,
    selectedExtensionPath,
    onSelectSettingsSection,
    onSelectSettingsWorkspace,
    onSelectSkillsWorkspace,
    onSelectExtensionsWorkspace,
    onSelectSkillPath,
    onSelectExtensionPath,
    onArchiveSession,
    onRenameSession,
    onSelectSession,
    onUnarchiveSession,
  } = props;

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Collision detection based on workspace row headers only (~30px top of each group),
  // not the full group height including all sessions.
  const headerCollision: CollisionDetection = (args) => {
    const pointerY = args.pointerCoordinates?.y;
    if (pointerY == null) return [];

    let closest: { id: string; distance: number } | null = null;
    for (const container of args.droppableContainers) {
      const rect = container.rect.current;
      if (!rect) continue;
      const headerCenter = rect.top + 15; // center of the ~30px workspace row header
      const distance = Math.abs(pointerY - headerCenter);
      if (!closest || distance < closest.distance) {
        closest = { id: String(container.id), distance };
      }
    }
    return closest ? [{ id: closest.id, data: { droppableContainer: args.droppableContainers.find((c) => String(c.id) === closest!.id)! } }] : [];
  };

  const rootGroups = threadGroups.filter((g) => g.rootWorkspace.kind === "primary");
  const orphanGroups = threadGroups.filter((g) => g.rootWorkspace.kind !== "primary");
  const rootGroupIds = rootGroups.map((g) => g.rootWorkspace.id);
  const canDrag = rootGroups.length > 1;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rootGroupIds.indexOf(String(active.id));
    const newIndex = rootGroupIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const newOrder = arrayMove(rootGroupIds, oldIndex, newIndex);
    // Optimistically update local state to avoid snap-back animation
    setSnapshot((prev) => prev ? { ...prev, workspaceOrder: newOrder } : prev);
    void api.reorderWorkspaces(newOrder);
  }

  const activeGroup = activeId ? rootGroups.find((g) => g.rootWorkspace.id === activeId) : undefined;
  const modeTitle = activeView === "skills" ? "技能" : activeView === "extensions" ? "扩展" : activeView === "settings" ? "设置" : "对话";
  const modeSubtitle = activeView === "skills"
    ? "在侧栏选择技能，中间区域查看说明、命令和配置。"
    : activeView === "extensions"
      ? "在侧栏选择扩展或内置配置，中间区域管理详情。"
      : activeView === "settings"
        ? "像 VS Code 一样在侧栏切换设置分类，中间区域编辑配置。"
        : "按工作区分组浏览历史对话，快速切换，并结合改动审查侧栏一起工作。";

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="sidebar__brand" aria-label="Pi 工作台">
          <div className="sidebar__brand-mark">π</div>
          <div>
            <strong>Pi 工作台</strong>
            <small>{modeTitle} · AI 编程空间</small>
          </div>
        </div>

        <button
          className="sidebar__new"
          type="button"
          disabled={!selectedWorkspace}
          onClick={onNewThread}
        >
          <PlusIcon />
          <span>新对话</span>
        </button>

        <div className="sidebar__nav sidebar__nav--primary">
          <button
            className={`sidebar__nav-item ${activeView === "threads" || activeView === "new-thread" ? "sidebar__nav-item--active" : ""}`}
            type="button"
            onClick={() => onSetActiveView("threads")}
          >
            <FolderIcon />
            <span>对话</span>
          </button>
          <button
            className={`sidebar__nav-item ${activeView === "skills" ? "sidebar__nav-item--active" : ""}`}
            type="button"
            onClick={() => onOpenSkills(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id)}
          >
            <SkillIcon />
            <span>技能</span>
          </button>
          <button
            className={`sidebar__nav-item ${activeView === "extensions" ? "sidebar__nav-item--active" : ""}`}
            type="button"
            onClick={() => onOpenExtensions(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id)}
          >
            <ExtensionIcon />
            <span>扩展</span>
          </button>
          <button
            className={`sidebar__nav-item ${activeView === "settings" ? "sidebar__nav-item--active" : ""}`}
            type="button"
            onClick={() => onOpenSettings(selectedWorkspace?.rootWorkspaceId ?? selectedWorkspace?.id)}
          >
            <SettingsIcon />
            <span>设置</span>
          </button>
        </div>
        <p className="sidebar__mode-summary">{modeSubtitle}</p>
      </div>

      {activeView === "skills" ? (
        <SkillsSidebarContent
          rootWorkspaceOptions={rootWorkspaceOptions}
          workspace={skillsWorkspace}
          runtime={skillsRuntime}
          selectedSkillPath={selectedSkillPath}
          onSelectWorkspace={onSelectSkillsWorkspace}
          onSelectSkillPath={onSelectSkillPath}
        />
      ) : activeView === "extensions" ? (
        <ExtensionsSidebarContent
          rootWorkspaceOptions={rootWorkspaceOptions}
          workspace={extensionsWorkspace}
          runtime={extensionsRuntime}
          selectedExtensionPath={selectedExtensionPath}
          onSelectWorkspace={onSelectExtensionsWorkspace}
          onSelectExtensionPath={onSelectExtensionPath}
        />
      ) : activeView === "settings" ? (
        <SettingsSidebarContent
          rootWorkspaceOptions={rootWorkspaceOptions}
          workspace={settingsWorkspace}
          settingsNav={settingsNav}
          settingsSection={settingsSection}
          onSelectWorkspace={onSelectSettingsWorkspace}
          onSelectSection={onSelectSettingsSection}
        />
      ) : (
        <div className="sidebar__thread-content">
          <div className="sidebar__tabs" role="tablist" aria-label="侧栏内容">
            <button
              className={`sidebar__tab ${sidebarTab === "conversations" ? "sidebar__tab--active" : ""}`}
              role="tab"
              aria-selected={sidebarTab === "conversations"}
              type="button"
              onClick={() => onSetSidebarTab("conversations")}
            >
              对话
            </button>
            <button
              className={`sidebar__tab ${sidebarTab === "projects" ? "sidebar__tab--active" : ""}`}
              role="tab"
              aria-selected={sidebarTab === "projects"}
              type="button"
              onClick={() => onSetSidebarTab("projects")}
            >
              项目
            </button>
          </div>
          <div className="sidebar__section-wrap">
            {sidebarTab === "conversations" ? (
              <ConversationSidebar
                recentConversations={recentConversations}
                conversationGroups={conversationGroups}
                selectedWorkspace={selectedWorkspace}
                selectedSession={selectedSession}
                onSelectSession={onSelectSession}
                onCreateConversationGroup={onCreateConversationGroup}
                onRenameConversationGroup={onRenameConversationGroup}
                onDeleteConversationGroup={onDeleteConversationGroup}
                onAssignConversationToGroup={onAssignConversationToGroup}
              />
            ) : (
      <div className="sidebar__section sidebar__projects-panel">
        <div className="section__head">
          <span>历史对话</span>
          <div className="section__tools">
            <button
              aria-label="打开文件夹"
              className="icon-button"
              type="button"
              onClick={() => {
                void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
              }}
            >
              <FolderIcon />
            </button>
          </div>
        </div>

        {visibleWorkspaces.length === 0 ? (
          <div className="empty-state" data-testid="empty-state">
            <h2>还没有文件夹</h2>
            <p>先打开一个项目文件夹，才能建立工作区和历史对话列表。</p>
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                void updateSnapshot(api, setSnapshot, () => api.pickWorkspace());
              }}
            >
              打开第一个文件夹
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={headerCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={rootGroupIds} strategy={verticalListSortingStrategy}>
              <div className="workspace-list" data-testid="workspace-list">
                {rootGroups.map((group) => (
                  <SortableWorkspaceGroup
                    key={group.rootWorkspace.id}
                    group={group}
                    canDrag={canDrag}
                    selectedWorkspace={selectedWorkspace}
                    selectedSession={selectedSession}
                    linkedWorktreeByWorkspaceId={linkedWorktreeByWorkspaceId}
                    sessionCategoriesByWorkspace={sessionCategoriesByWorkspace}
                    setSnapshot={setSnapshot}
                    wsMenu={wsMenu}
                    api={api}
                    onArchiveSession={onArchiveSession}
                    onRenameSession={onRenameSession}
                    onSelectSession={onSelectSession}
                    onUnarchiveSession={onUnarchiveSession}
                  />
                ))}
                {orphanGroups.map((group) => (
                  <WorkspaceGroupContent
                    key={group.rootWorkspace.id}
                    group={group}
                    canDrag={false}
                    selectedWorkspace={selectedWorkspace}
                    selectedSession={selectedSession}
                    linkedWorktreeByWorkspaceId={linkedWorktreeByWorkspaceId}
                    sessionCategoriesByWorkspace={sessionCategoriesByWorkspace}
                    setSnapshot={setSnapshot}
                    wsMenu={wsMenu}
                    api={api}
                    onArchiveSession={onArchiveSession}
                    onRenameSession={onRenameSession}
                    onSelectSession={onSelectSession}
                    onUnarchiveSession={onUnarchiveSession}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeGroup ? (
                <div className="workspace-group workspace-group--overlay">
                  <WorkspaceGroupContent
                    group={activeGroup}
                    canDrag={false}
                    selectedWorkspace={selectedWorkspace}
                    selectedSession={selectedSession}
                    linkedWorktreeByWorkspaceId={linkedWorktreeByWorkspaceId}
                    sessionCategoriesByWorkspace={sessionCategoriesByWorkspace}
                    setSnapshot={setSnapshot}
                    wsMenu={wsMenu}
                    api={api}
                    onArchiveSession={onArchiveSession}
                    onRenameSession={onRenameSession}
                    onSelectSession={onSelectSession}
                    onUnarchiveSession={onUnarchiveSession}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function SkillsSidebarContent({
  rootWorkspaceOptions,
  workspace,
  runtime,
  selectedSkillPath,
  onSelectWorkspace,
  onSelectSkillPath,
}: {
  readonly rootWorkspaceOptions: readonly WorkspaceRecord[];
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly selectedSkillPath?: string;
  readonly onSelectWorkspace: (workspaceId: string) => void;
  readonly onSelectSkillPath: (filePath: string) => void;
}) {
  const [query, setQuery] = useState("");
  const skills = runtime?.skills ?? [];
  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description, skill.source, skill.slashCommand].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [query, skills]);

  return (
    <div className="sidebar__section management-sidebar" data-testid="management-sidebar">
      <WorkspaceSelect
        label="技能工作区"
        rootWorkspaceOptions={rootWorkspaceOptions}
        workspace={workspace}
        onSelectWorkspace={onSelectWorkspace}
      />
      <label className="sidebar-management__field">
        <span>搜索技能</span>
        <input
          aria-label="搜索技能"
          className="sidebar-management__search"
          placeholder="搜索技能"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="sidebar-management__list" data-testid="skills-list">
        {filteredSkills.length > 0 ? filteredSkills.map((skill) => (
          <button
            className={`sidebar-management__item ${selectedSkillPath === skill.filePath ? "sidebar-management__item--active" : ""}`}
            key={skill.filePath}
            type="button"
            onClick={() => onSelectSkillPath(skill.filePath)}
          >
            <span className="sidebar-management__title">{titleCase(skill.name)}</span>
            <span className="sidebar-management__meta">{skill.slashCommand}</span>
          </button>
        )) : (
          <div className="sidebar-management__empty">未找到技能</div>
        )}
      </div>
    </div>
  );
}

function ExtensionsSidebarContent({
  rootWorkspaceOptions,
  workspace,
  runtime,
  selectedExtensionPath,
  onSelectWorkspace,
  onSelectExtensionPath,
}: {
  readonly rootWorkspaceOptions: readonly WorkspaceRecord[];
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly selectedExtensionPath?: string;
  readonly onSelectWorkspace: (workspaceId: string) => void;
  readonly onSelectExtensionPath: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const extensions = runtime?.extensions ?? [];
  const filteredExtensions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return extensions;
    return extensions.filter((extension) =>
      [extension.displayName, extension.path, extension.sourceInfo.source, extensionSourceSummary(extension)].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [extensions, query]);

  return (
    <div className="sidebar__section management-sidebar" data-testid="management-sidebar">
      <WorkspaceSelect
        label="扩展工作区"
        rootWorkspaceOptions={rootWorkspaceOptions}
        workspace={workspace}
        onSelectWorkspace={onSelectWorkspace}
      />
      <label className="sidebar-management__field">
        <span>搜索扩展</span>
        <input
          aria-label="搜索扩展"
          className="sidebar-management__search"
          placeholder="搜索扩展"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="sidebar-management__list" data-testid="extensions-list">
        <button
          className={`sidebar-management__item ${selectedExtensionPath === "__components__" ? "sidebar-management__item--active" : ""}`}
          type="button"
          onClick={() => onSelectExtensionPath("__components__")}
        >
          <span className="sidebar-management__title">组件管理</span>
          <span className="sidebar-management__meta">选择显示在右侧 Dock 的组件</span>
        </button>
        <button
          className={`sidebar-management__item ${selectedExtensionPath === "__development_mode__" ? "sidebar-management__item--active" : ""}`}
          type="button"
          onClick={() => onSelectExtensionPath("__development_mode__")}
        >
          <span className="sidebar-management__title">开发模式</span>
          <span className="sidebar-management__meta">主 Agent 和子 Agent 配置</span>
        </button>
        <button
          className={`sidebar-management__item ${selectedExtensionPath === "__background__" ? "sidebar-management__item--active" : ""}`}
          type="button"
          onClick={() => onSelectExtensionPath("__background__")}
        >
          <span className="sidebar-management__title">背景渐变</span>
          <span className="sidebar-management__meta">外观配置</span>
        </button>
        <button
          className={`sidebar-management__item ${selectedExtensionPath === "__cli_tools__" ? "sidebar-management__item--active" : ""}`}
          type="button"
          onClick={() => onSelectExtensionPath("__cli_tools__")}
        >
          <span className="sidebar-management__title">CLI 工具</span>
          <span className="sidebar-management__meta">MySQL、PostgreSQL 等连接管理</span>
        </button>
        {filteredExtensions.map((extension) => (
          <button
            className={`sidebar-management__item ${selectedExtensionPath === extension.path ? "sidebar-management__item--active" : ""}`}
            key={extension.path}
            type="button"
            onClick={() => onSelectExtensionPath(extension.path)}
          >
            <span className="sidebar-management__title">{extension.displayName}</span>
            <span className="sidebar-management__meta">{extension.enabled ? "已启用" : "已禁用"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsSidebarContent({
  rootWorkspaceOptions,
  workspace,
  settingsNav,
  settingsSection,
  onSelectWorkspace,
  onSelectSection,
}: {
  readonly rootWorkspaceOptions: readonly WorkspaceRecord[];
  readonly workspace?: WorkspaceRecord;
  readonly settingsNav: readonly { readonly id: SettingsSection; readonly label: string }[];
  readonly settingsSection: SettingsSection;
  readonly onSelectWorkspace: (workspaceId: string) => void;
  readonly onSelectSection: (section: SettingsSection) => void;
}) {
  return (
    <div className="sidebar__section management-sidebar" data-testid="management-sidebar">
      <WorkspaceSelect
        label="设置工作区"
        rootWorkspaceOptions={rootWorkspaceOptions}
        workspace={workspace}
        onSelectWorkspace={onSelectWorkspace}
      />
      <div className="sidebar-management__list">
        {settingsNav.map((item) => (
          <button
            className={`sidebar-management__item ${settingsSection === item.id ? "sidebar-management__item--active" : ""}`}
            key={item.id}
            type="button"
            onClick={() => onSelectSection(item.id)}
          >
            <span className="sidebar-management__title">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceSelect({
  label,
  rootWorkspaceOptions,
  workspace,
  onSelectWorkspace,
}: {
  readonly label: string;
  readonly rootWorkspaceOptions: readonly WorkspaceRecord[];
  readonly workspace?: WorkspaceRecord;
  readonly onSelectWorkspace: (workspaceId: string) => void;
}) {
  return (
    <label className="sidebar-management__field">
      <span>{label}</span>
      <select value={workspace?.id ?? ""} onChange={(event) => onSelectWorkspace(event.target.value)}>
        {rootWorkspaceOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    </label>
  );
}

/* ── Sortable workspace group wrapper ──────────────────── */

interface WorkspaceGroupProps {
  readonly group: ThreadGroup;
  readonly canDrag: boolean;
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedSession: SessionRecord | undefined;
  readonly linkedWorktreeByWorkspaceId: ReadonlyMap<string, WorktreeRecord>;
  readonly sessionCategoriesByWorkspace: SessionCategoriesByWorkspace;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
  readonly wsMenu: WorkspaceMenuState;
  readonly api: PiDesktopApi;
  readonly onArchiveSession: (target: { workspaceId: string; sessionId: string }) => void;
  readonly onRenameSession: (target: { workspaceId: string; sessionId: string }, title: string) => void;
  readonly onSelectSession: (target: { workspaceId: string; sessionId: string }) => void;
  readonly onUnarchiveSession: (target: { workspaceId: string; sessionId: string }) => void;
}

function SortableWorkspaceGroup(props: WorkspaceGroupProps) {
  const { group, wsMenu } = props;
  const isRenaming = wsMenu.workspaceRenameId === group.rootWorkspace.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.rootWorkspace.id,
    disabled: isRenaming,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`workspace-group ${isDragging ? "workspace-group--dragging" : ""}`}
    >
      <WorkspaceGroupContent
        {...props}
        dragHandleProps={props.canDrag && !isRenaming ? { attributes, listeners } : undefined}
      />
    </section>
  );
}

/* ── Workspace group content (used both inline and in overlay) ──── */

interface DragHandleProps {
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
}

const MAX_SESSION_CATEGORY_DEPTH = 3;

type SessionCategoryDraft = readonly SessionCategoryNode[];

interface SessionCategoryMoveOption {
  readonly id: string;
  readonly label: string;
}

function threadKey(target: WorkspaceSessionTarget): string {
  return `${encodeURIComponent(target.workspaceId)}:${encodeURIComponent(target.sessionId)}`;
}

function parseThreadKey(key: string): WorkspaceSessionTarget | undefined {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator >= key.length - 1) {
    return undefined;
  }
  try {
    return {
      workspaceId: decodeURIComponent(key.slice(0, separator)),
      sessionId: decodeURIComponent(key.slice(separator + 1)),
    };
  } catch {
    return undefined;
  }
}

function makeSessionCategoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `category-${crypto.randomUUID()}`;
  }
  return `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function flattenSessionCategoryOptions(
  nodes: readonly SessionCategoryNode[],
  trail: readonly string[] = [],
): readonly SessionCategoryMoveOption[] {
  return nodes.flatMap((node) => {
    const nextTrail = [...trail, node.name];
    return [
      { id: node.id, label: nextTrail.join(" / ") },
      ...flattenSessionCategoryOptions(node.children, nextTrail),
    ];
  });
}

function collectCategorizedThreadKeys(nodes: readonly SessionCategoryNode[], output = new Set<string>()): Set<string> {
  for (const node of nodes) {
    for (const ref of node.sessionRefs) {
      output.add(threadKey(ref));
    }
    collectCategorizedThreadKeys(node.children, output);
  }
  return output;
}

function removeSessionRefsFromCategories(
  nodes: readonly SessionCategoryNode[],
  keysToRemove: ReadonlySet<string>,
): SessionCategoryDraft {
  return nodes.map((node) => ({
    ...node,
    sessionRefs: node.sessionRefs.filter((ref) => !keysToRemove.has(threadKey(ref))),
    children: removeSessionRefsFromCategories(node.children, keysToRemove),
  }));
}

function moveSessionRefToCategory(
  nodes: readonly SessionCategoryNode[],
  categoryId: string,
  ref: WorkspaceSessionTarget,
): SessionCategoryDraft {
  return addSessionRefToCategory(removeSessionRefsFromCategories(nodes, new Set([threadKey(ref)])), categoryId, ref);
}

function addSessionRefToCategory(
  nodes: readonly SessionCategoryNode[],
  categoryId: string,
  ref: WorkspaceSessionTarget,
): SessionCategoryDraft {
  return nodes.map((node) => {
    if (node.id === categoryId) {
      const exists = node.sessionRefs.some((entry) => threadKey(entry) === threadKey(ref));
      return exists ? node : { ...node, sessionRefs: [...node.sessionRefs, ref] };
    }
    return { ...node, children: addSessionRefToCategory(node.children, categoryId, ref) };
  });
}

function addChildSessionCategory(
  nodes: readonly SessionCategoryNode[],
  parentId: string,
  child: SessionCategoryNode,
  depth = 1,
): SessionCategoryDraft {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return depth >= MAX_SESSION_CATEGORY_DEPTH
        ? node
        : { ...node, children: [...node.children, child] };
    }
    return {
      ...node,
      children: addChildSessionCategory(node.children, parentId, child, depth + 1),
    };
  });
}

function renameSessionCategory(
  nodes: readonly SessionCategoryNode[],
  categoryId: string,
  name: string,
): SessionCategoryDraft {
  return nodes.map((node) =>
    node.id === categoryId
      ? { ...node, name }
      : { ...node, children: renameSessionCategory(node.children, categoryId, name) },
  );
}

function WorkspaceGroupContent(
  props: WorkspaceGroupProps & { readonly dragHandleProps?: DragHandleProps },
) {
  const {
    group: { rootWorkspace, threads, archivedThreads },
    selectedWorkspace,
    selectedSession,
    linkedWorktreeByWorkspaceId,
    sessionCategoriesByWorkspace,
    setSnapshot,
    wsMenu,
    api,
    onArchiveSession,
    onRenameSession,
    onSelectSession,
    onUnarchiveSession,
    dragHandleProps,
  } = props;

  const workspaceActive =
    rootWorkspace.id === selectedWorkspace?.id ||
    rootWorkspace.id === selectedWorkspace?.rootWorkspaceId;
  const linkedWorktree = linkedWorktreeByWorkspaceId.get(rootWorkspace.id);
  const archivedSectionOpen = wsMenu.expandedArchivedByWorkspace[rootWorkspace.id] ?? false;
  const isCollapsed = wsMenu.collapsedWorkspaces[rootWorkspace.id] ?? false;
  const categories = sessionCategoriesByWorkspace[rootWorkspace.id]?.categories ?? [];
  const allThreads = useMemo(() => [...threads, ...archivedThreads], [archivedThreads, threads]);
  const threadsByKey = useMemo(() => new Map(allThreads.map((thread) => [threadKey({
    workspaceId: thread.workspaceId,
    sessionId: thread.session.id,
  }), thread] as const)), [allThreads]);
  const archivedThreadKeys = useMemo(
    () => new Set(archivedThreads.map((thread) => threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id }))),
    [archivedThreads],
  );
  const categorizedThreadKeys = useMemo(() => collectCategorizedThreadKeys(categories), [categories]);
  const categoryMoveOptions = useMemo(() => flattenSessionCategoryOptions(categories), [categories]);
  const uncategorizedThreads = useMemo(
    () => threads.filter((thread) => !categorizedThreadKeys.has(threadKey({
      workspaceId: thread.workspaceId,
      sessionId: thread.session.id,
    }))),
    [categorizedThreadKeys, threads],
  );
  const uncategorizedArchivedThreads = useMemo(
    () => archivedThreads.filter((thread) => !categorizedThreadKeys.has(threadKey({
      workspaceId: thread.workspaceId,
      sessionId: thread.session.id,
    }))),
    [archivedThreads, categorizedThreadKeys],
  );
  const [selectedCategoryThreadKeys, setSelectedCategoryThreadKeys] = useState<readonly string[]>([]);
  const [mergeCategoryNaming, setMergeCategoryNaming] = useState(false);
  const [mergeCategoryNameDraft, setMergeCategoryNameDraft] = useState("");
  const selectedCategoryThreadKeySet = useMemo(
    () => new Set(selectedCategoryThreadKeys),
    [selectedCategoryThreadKeys],
  );
  const classificationSelectionActive = selectedCategoryThreadKeys.length > 0;

  const commitCategories = (nextCategories: readonly SessionCategoryNode[]) => {
    setSnapshot((previous) => {
      if (!previous) {
        return previous;
      }
      return {
        ...previous,
        sessionCategoriesByWorkspace: {
          ...previous.sessionCategoriesByWorkspace,
          [rootWorkspace.id]: { version: 1, categories: nextCategories },
        },
        revision: previous.revision + 1,
      };
    });
    void api.setWorkspaceSessionCategories(rootWorkspace.id, nextCategories).then((nextState) => {
      setSnapshot(nextState);
    });
  };

  const toggleSessionCategorySelection = (thread: ThreadListEntry, force?: boolean) => {
    const key = threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id });
    setSelectedCategoryThreadKeys((current) => {
      const selected = new Set(current);
      const nextChecked = force ?? !selected.has(key);
      if (nextChecked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }
      return [...selected];
    });
  };

  const beginSessionCategorySelection = (thread: ThreadListEntry) => {
    setSelectedCategoryThreadKeys([threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id })]);
  };

  const mergeSelectedSessionsIntoCategory = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    const selectedRefs = selectedCategoryThreadKeys
      .map(parseThreadKey)
      .filter((target): target is WorkspaceSessionTarget => Boolean(target))
      .filter((target) => threadsByKey.has(threadKey(target)));
    if (selectedRefs.length === 0) {
      return;
    }

    const keysToRemove = new Set(selectedRefs.map(threadKey));
    const nextCategories = [
      ...removeSessionRefsFromCategories(categories, keysToRemove),
      {
        id: makeSessionCategoryId(),
        name: trimmedName,
        sessionRefs: selectedRefs,
        children: [],
      },
    ];
    setSelectedCategoryThreadKeys([]);
    setMergeCategoryNaming(false);
    setMergeCategoryNameDraft("");
    commitCategories(nextCategories);
  };

  const addSessionCategoryChild = (parentId: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    commitCategories(addChildSessionCategory(categories, parentId, {
      id: makeSessionCategoryId(),
      name: trimmedName,
      sessionRefs: [],
      children: [],
    }));
  };

  const renameCategory = (category: SessionCategoryNode, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === category.name) {
      return;
    }
    commitCategories(renameSessionCategory(categories, category.id, trimmedName));
  };

  const moveThreadToCategory = (thread: ThreadListEntry, categoryId: string) => {
    const key = threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id });
    if (!categories.some((category) => category.id === categoryId) && !sessionCategoriesByWorkspace[rootWorkspace.id]) {
      return;
    }
    commitCategories(moveSessionRefToCategory(categories, categoryId, {
      workspaceId: thread.workspaceId,
      sessionId: thread.session.id,
    }));
  };

  const removeThreadFromCategory = (thread: ThreadListEntry) => {
    const key = threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id });
    commitCategories(removeSessionRefsFromCategories(categories, new Set([key])));
  };

  const renderThreadRow = (thread: ThreadListEntry, archived?: boolean) => {
    const active = thread.workspaceId === selectedWorkspace?.id && thread.session.id === selectedSession?.id;
    const key = threadKey({ workspaceId: thread.workspaceId, sessionId: thread.session.id });
    const isArchived = archived ?? archivedThreadKeys.has(key);
    const isCategorized = categorizedThreadKeys.has(key);
    return (
      <ThreadSessionRow
        key={key}
        active={active}
        archived={isArchived}
        categorySelectionActive={classificationSelectionActive}
        categorySelected={selectedCategoryThreadKeySet.has(key)}
        categoryMoveOptions={categoryMoveOptions}
        categorized={isCategorized}
        thread={thread}
        onAction={() =>
          isArchived
            ? onUnarchiveSession({
                workspaceId: thread.workspaceId,
                sessionId: thread.session.id,
              })
            : onArchiveSession({
                workspaceId: thread.workspaceId,
                sessionId: thread.session.id,
              })
        }
        onBeginCategorySelect={() => beginSessionCategorySelection(thread)}
        onMoveToCategory={(categoryId) => moveThreadToCategory(thread, categoryId)}
        onRemoveFromCategory={() => removeThreadFromCategory(thread)}
        onRename={(title) =>
          onRenameSession({
            workspaceId: thread.workspaceId,
            sessionId: thread.session.id,
          }, title)
        }
        onSelect={() => onSelectSession({ workspaceId: thread.workspaceId, sessionId: thread.session.id })}
        onToggleCategorySelect={(checked) => toggleSessionCategorySelection(thread, checked)}
      />
    );
  };

  return (
    <>
      <div className={`workspace-row ${workspaceActive ? "workspace-row--active" : ""}`}>
        <button
          className={`workspace-row__select ${dragHandleProps ? "workspace-row__select--draggable" : ""}`}
          onClick={() => {
            wsMenu.selectWorkspace(rootWorkspace.id);
            wsMenu.toggleWorkspaceCollapsed(rootWorkspace.id);
          }}
          type="button"
          {...(dragHandleProps ? { ...dragHandleProps.attributes, ...dragHandleProps.listeners } : {})}
        >
          <span className="workspace-row__icon" aria-hidden="true" data-collapsed={isCollapsed || undefined}>
            <span className="workspace-row__icon-folder"><FolderIcon /></span>
            <span className="workspace-row__icon-chevron"><ChevronDownIcon /></span>
          </span>
          <span className="workspace-row__name-wrap">
            <span className="workspace-row__name">{rootWorkspace.name}</span>
            <span className="workspace-row__count">{threads.length}</span>
          </span>
        </button>
        <span
          className="workspace-row__menu-wrap"
          ref={wsMenu.workspaceMenuId === rootWorkspace.id ? wsMenu.workspaceMenuWrapRef : undefined}
        >
          <button
            aria-label={`工作区操作：${rootWorkspace.name}`}
            aria-haspopup="menu"
            className="icon-button workspace-row__menu-button"
            aria-expanded={wsMenu.workspaceMenuId === rootWorkspace.id}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              wsMenu.openWorkspaceMenu(rootWorkspace.id);
            }}
          >
            …
          </button>
          {wsMenu.workspaceMenuId === rootWorkspace.id ? (
            <div className="workspace-menu">
              <button
                className="workspace-menu__item"
                type="button"
                onClick={(event) =>
                  wsMenu.runWorkspaceMenuAction(event, () => {
                    void api.openWorkspaceInFinder(rootWorkspace.id);
                  })
                }
              >
                打开文件夹
              </button>
              {linkedWorktree ? (
                <button
                  className="workspace-menu__item workspace-menu__item--danger"
                  type="button"
                  onClick={(event) =>
                    wsMenu.runWorkspaceMenuAction(event, () =>
                      wsMenu.removeWorktree(linkedWorktree.rootWorkspaceId || rootWorkspace.id, linkedWorktree),
                    )
                  }
                >
                  移除工作树
                </button>
              ) : (
                <button
                  className="workspace-menu__item"
                  type="button"
                  onClick={(event) =>
                    wsMenu.runWorkspaceMenuAction(event, () => wsMenu.createWorktree(rootWorkspace.id))
                  }
                >
                  创建永久工作树
                </button>
              )}
              <button
                className="workspace-menu__item"
                type="button"
                onClick={(event) => wsMenu.runWorkspaceMenuAction(event, () => wsMenu.startRename(rootWorkspace))}
              >
                修改名称
              </button>
              <button
                className="workspace-menu__item workspace-menu__item--danger"
                type="button"
                onClick={(event) => wsMenu.runWorkspaceMenuAction(event, () => wsMenu.removeWorkspace(rootWorkspace))}
              >
                移除
              </button>
            </div>
          ) : null}
        </span>
      </div>
      {wsMenu.workspaceRenameId === rootWorkspace.id ? (
        <form
          className="workspace-rename"
          ref={wsMenu.workspaceRenamePanelRef}
          onSubmit={(event) => {
            event.preventDefault();
            wsMenu.submitRename(rootWorkspace);
          }}
        >
          <input
            aria-label={`重命名 ${rootWorkspace.name}`}
            className="workspace-rename__input"
            ref={wsMenu.workspaceRenameInputRef}
            value={wsMenu.workspaceRenameDraft}
            onChange={(event) => {
              wsMenu.setWorkspaceRenameDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                wsMenu.cancelRename();
              }
            }}
          />
          <div className="workspace-rename__actions">
            <button className="workspace-rename__button" type="button" onClick={wsMenu.cancelRename}>
              取消
            </button>
            <button className="workspace-rename__button workspace-rename__button--primary" type="submit">
              保存
            </button>
          </div>
        </form>
      ) : null}
      {!isCollapsed ? (
        <>
          {classificationSelectionActive ? (
            <div className="session-category-toolbar" role="status">
              <span>已选择 {selectedCategoryThreadKeys.length} 个会话</span>
              {!mergeCategoryNaming ? (
                <button className="session-category-toolbar__button" type="button" onClick={() => setMergeCategoryNaming(true)}>
                  合并为分类
                </button>
              ) : (
                <form
                  className="session-category-toolbar__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mergeSelectedSessionsIntoCategory(mergeCategoryNameDraft);
                  }}
                >
                  <input
                    aria-label="分类名称"
                    className="session-category-toolbar__input"
                    placeholder="分类名称"
                    value={mergeCategoryNameDraft}
                    onChange={(event) => setMergeCategoryNameDraft(event.target.value)}
                  />
                  <button className="session-category-toolbar__button" type="submit">创建分类</button>
                </form>
              )}
              <button
                className="session-category-toolbar__button"
                type="button"
                onClick={() => {
                  setSelectedCategoryThreadKeys([]);
                  setMergeCategoryNaming(false);
                  setMergeCategoryNameDraft("");
                }}
              >
                取消
              </button>
            </div>
          ) : null}
          {categories.length > 0 ? (
            <div className="session-category-tree" role="tree" aria-label={`${rootWorkspace.name} 历史分类`}>
              {categories.map((category) => (
                <SessionCategoryNodeView
                  key={category.id}
                  category={category}
                  depth={1}
                  threadsByKey={threadsByKey}
                  renderThreadRow={renderThreadRow}
                  onAddChild={addSessionCategoryChild}
                  onRename={renameCategory}
                />
              ))}
            </div>
          ) : null}
          <div className="session-list">
            {uncategorizedThreads.map((thread) => renderThreadRow(thread))}
          </div>
          {uncategorizedArchivedThreads.length > 0 ? (
            <div className="archived-thread-group">
              <button
                aria-expanded={archivedSectionOpen}
                className="archived-thread-group__toggle"
                type="button"
                onClick={() => wsMenu.toggleArchived(rootWorkspace.id, !archivedSectionOpen)}
              >
                <span
                  aria-hidden="true"
                  className={`archived-thread-group__chevron ${archivedSectionOpen ? "archived-thread-group__chevron--open" : ""}`}
                >
                  <ChevronDownIcon />
                </span>
                <span>已归档</span>
                <span className="archived-thread-group__count">{uncategorizedArchivedThreads.length}</span>
              </button>
              {archivedSectionOpen ? (
                <div className="session-list session-list--archived">
                  {uncategorizedArchivedThreads.map((thread) => renderThreadRow(thread, true))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/* ── Session category tree ─────────────────────────────── */

function SessionCategoryNodeView({
  category,
  depth,
  threadsByKey,
  renderThreadRow,
  onAddChild,
  onRename,
}: {
  readonly category: SessionCategoryNode;
  readonly depth: number;
  readonly threadsByKey: ReadonlyMap<string, ThreadListEntry>;
  readonly renderThreadRow: (thread: ThreadListEntry) => ReactElement;
  readonly onAddChild: (categoryId: string, name: string) => void;
  readonly onRename: (category: SessionCategoryNode, name: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childNameDraft, setChildNameDraft] = useState("");
  const [renamingCategory, setRenamingCategory] = useState(false);
  const [renameDraft, setRenameDraft] = useState(category.name);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const categoryThreads = category.sessionRefs
    .map((ref) => threadsByKey.get(threadKey(ref)))
    .filter((thread): thread is ThreadListEntry => Boolean(thread));
  const totalCount = categoryThreads.length + [...collectCategorizedThreadKeys(category.children)].length;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && menuWrapRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <div
      className="session-category-node"
      data-testid="session-category-node"
      data-depth={depth}
      ref={menuWrapRef}
    >
      <button
        aria-label={`${category.name}，${totalCount} 个会话`}
        className="session-category-node__row"
        role="treeitem"
        type="button"
        onClick={() => setMenuOpen(false)}
        onMouseDown={(event) => {
          if (event.button !== 2) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }}
      >
        <span className="session-category-node__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
        <span className="session-category-node__name">{category.name}</span>
        <span className="session-category-node__count">{totalCount}</span>
      </button>
      {menuOpen ? (
        <div className="session-menu session-category-node__menu" role="menu">
          {depth < MAX_SESSION_CATEGORY_DEPTH ? (
            <button
              className="session-menu__item"
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setAddingChild(true);
              }}
            >
              新建子类
            </button>
          ) : null}
          <button
            className="session-menu__item"
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setRenameDraft(category.name);
              setRenamingCategory(true);
            }}
          >
            重命名分类
          </button>
        </div>
      ) : null}
      {addingChild ? (
        <form
          className="session-category-node__form"
          onSubmit={(event) => {
            event.preventDefault();
            onAddChild(category.id, childNameDraft);
            setChildNameDraft("");
            setAddingChild(false);
          }}
        >
          <input
            aria-label={`子分类名称 ${category.name}`}
            className="session-category-node__input"
            placeholder="子分类名称"
            value={childNameDraft}
            onChange={(event) => setChildNameDraft(event.target.value)}
          />
          <button className="session-category-node__form-button" type="submit">创建</button>
          <button
            className="session-category-node__form-button"
            type="button"
            onClick={() => {
              setChildNameDraft("");
              setAddingChild(false);
            }}
          >
            取消
          </button>
        </form>
      ) : null}
      {renamingCategory ? (
        <form
          className="session-category-node__form"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(category, renameDraft);
            setRenamingCategory(false);
          }}
        >
          <input
            aria-label={`重命名分类 ${category.name}`}
            className="session-category-node__input"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
          />
          <button className="session-category-node__form-button" type="submit">保存</button>
          <button
            className="session-category-node__form-button"
            type="button"
            onClick={() => {
              setRenameDraft(category.name);
              setRenamingCategory(false);
            }}
          >
            取消
          </button>
        </form>
      ) : null}
      <div className="session-category-node__content">
        {category.children.map((child) => (
          <SessionCategoryNodeView
            key={child.id}
            category={child}
            depth={depth + 1}
            threadsByKey={threadsByKey}
            renderThreadRow={renderThreadRow}
            onAddChild={onAddChild}
            onRename={onRename}
          />
        ))}
        {categoryThreads.length > 0 ? (
          <div className="session-list session-list--nested">
            {categoryThreads.map((thread) => renderThreadRow(thread))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Thread session row ────────────────────────────────── */

function sessionIndicatorVariant(thread: ThreadListEntry): "running" | "unseen" | "failed" | "none" {
  if (thread.session.status === "running") {
    return "running";
  }
  if (thread.session.status === "failed") {
    return "failed";
  }
  if (thread.session.hasUnseenUpdate) {
    return "unseen";
  }
  return "none";
}

function ThreadSessionRow({
  active,
  archived = false,
  categorySelectionActive = false,
  categoryMoveOptions = [],
  categorySelected = false,
  categorized = false,
  thread,
  onAction,
  onBeginCategorySelect,
  onMoveToCategory,
  onRemoveFromCategory,
  onRename,
  onSelect,
  onToggleCategorySelect,
}: {
  readonly active: boolean;
  readonly archived?: boolean;
  readonly categorySelectionActive?: boolean;
  readonly categoryMoveOptions?: readonly SessionCategoryMoveOption[];
  readonly categorySelected?: boolean;
  readonly categorized?: boolean;
  readonly thread: ThreadListEntry;
  readonly onAction: () => void;
  readonly onBeginCategorySelect: () => void;
  readonly onMoveToCategory: (categoryId: string) => void;
  readonly onRemoveFromCategory: () => void;
  readonly onRename: (title: string) => void;
  readonly onSelect: () => void;
  readonly onToggleCategorySelect: (checked: boolean) => void;
}) {
  const indicatorVariant = sessionIndicatorVariant(thread);
  const environmentLabel = thread.environment.kind === "worktree"
    ? thread.environment.branchName || thread.environment.label
    : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(thread.session.title);
  const menuWrapRef = useRef<HTMLSpanElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!renaming) {
      setRenameDraft(thread.session.title);
    }
  }, [renaming, thread.session.title]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && menuWrapRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  const submitRename = () => {
    const nextTitle = renameDraft.trim();
    setRenaming(false);
    if (!nextTitle || nextTitle === thread.session.title) {
      setRenameDraft(thread.session.title);
      return;
    }
    onRename(nextTitle);
  };

  return (
    <div
      className={`session-row ${active ? "session-row--active" : ""} ${renaming ? "session-row--renaming" : ""} ${categorySelectionActive ? "session-row--category-selecting" : ""}`}
      data-sidebar-indicator={indicatorVariant}
      data-session-id={thread.session.id}
      onMouseDown={(event) => {
        if (event.button !== 2) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
    >
      {categorySelectionActive ? (
        <input
          aria-label={`选择会话 ${thread.session.title}`}
          checked={categorySelected}
          className="session-row__category-checkbox"
          type="checkbox"
          onChange={(event) => onToggleCategorySelect(event.currentTarget.checked)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
      <button className="session-row__select" onClick={onSelect} type="button">
        <span className="session-row__leading" aria-hidden="true">
          {indicatorVariant === "running" ? <span className="session-row__status session-row__status--running" /> : null}
          {indicatorVariant === "unseen" ? <span className="session-row__status session-row__status--unseen" /> : null}
          {indicatorVariant === "failed" ? <span className="session-row__status session-row__status--failed" /> : null}
        </span>
        <span className="session-row__body">
          <span className="session-row__title-line">
            <span className="session-row__title">{thread.session.title}</span>
            {environmentLabel ? <span className="session-row__environment">{environmentLabel}</span> : null}
          </span>
          {thread.session.preview ? <span className="session-row__preview">{thread.session.preview}</span> : null}
        </span>
      </button>
      <span className="session-row__trailing" ref={menuWrapRef}>
        {thread.environment.kind === "worktree" ? (
          <span className="session-row__workspace-icon" aria-hidden="true" title="工作树分支">
            <WorktreeIcon />
          </span>
        ) : null}
        <span className="session-row__time">{formatRelativeTime(thread.session.updatedAt)}</span>
        <button
          aria-label={`会话操作：${thread.session.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="icon-button session-row__action session-row__menu-button"
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          …
        </button>
        {menuOpen ? (
          <div className="session-menu" role="menu">
            {!archived ? (
              <button
                className="session-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onBeginCategorySelect();
                }}
              >
                多选此会话
              </button>
            ) : null}
            {categoryMoveOptions.length > 0 ? (
              <div className="session-menu__section" role="none">
                <div className="session-menu__section-title">移动到分组</div>
                {categoryMoveOptions.map((option) => (
                  <button
                    className="session-menu__item"
                    key={option.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveToCategory(option.id);
                    }}
                  >
                    移动到分组：{option.label}
                  </button>
                ))}
                {categorized ? (
                  <button
                    className="session-menu__item"
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRemoveFromCategory();
                    }}
                  >
                    移出分组
                  </button>
                ) : null}
              </div>
            ) : null}
            <button
              className="session-menu__item"
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
            >
              重命名会话
            </button>
            <button
              className={`session-menu__item ${archived ? "" : "session-menu__item--danger"}`}
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onAction();
              }}
            >
              <span className="session-menu__icon" aria-hidden="true">{archived ? <RestoreIcon /> : <ArchiveIcon />}</span>
              {archived ? "恢复会话" : "归档会话"}
            </button>
          </div>
        ) : null}
      </span>
      {renaming ? (
        <form
          className="session-rename"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <input
            aria-label={`重命名会话 ${thread.session.title}`}
            className="session-rename__input"
            ref={renameInputRef}
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setRenameDraft(thread.session.title);
                setRenaming(false);
              }
            }}
          />
          <div className="session-rename__actions">
            <button
              className="session-rename__button"
              type="button"
              onClick={() => {
                setRenameDraft(thread.session.title);
                setRenaming(false);
              }}
            >
              取消
            </button>
            <button className="session-rename__button session-rename__button--primary" type="submit">
              保存
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
