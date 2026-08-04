import type {
  DesktopSessionCategoryNode,
  LegacySessionCategoryNode,
  SessionCategoriesByWorkspace,
  SessionCategoryNode,
  TaskListItem,
  WorkspaceRecord,
} from './protocol'

export interface ConversationGroup {
  readonly key: string
  readonly label: string
  readonly count: number
  readonly items: TaskListItem[]
}

export function buildConversationGroups(input: {
  readonly tasks: readonly TaskListItem[]
  readonly workspaces: readonly WorkspaceRecord[]
  readonly sessionCategoriesByWorkspace: SessionCategoriesByWorkspace
}): ConversationGroup[] {
  const groups: ConversationGroup[] = []
  const categorizedKeys = new Set<string>()

  for (const workspace of input.workspaces) {
    const categories = categoriesFor(input.sessionCategoriesByWorkspace[workspace.id])
    if (!categories.length) continue
    for (const category of categories) {
      pushCategoryGroup(groups, categorizedKeys, workspace.id, workspace.name, category, input.tasks)
    }
  }

  for (const workspace of input.workspaces) {
    const workspaceItems = input.tasks.filter((item) => {
      const key = `${item.workspaceId}:${item.sessionId}`
      return item.workspaceId === workspace.id && !categorizedKeys.has(key)
    })
    if (workspaceItems.length > 0) {
      groups.push({
        key: `workspace:${workspace.id}`,
        label: workspace.name || workspace.path || '未命名工作区',
        count: workspaceItems.length,
        items: [...workspaceItems],
      })
      for (const item of workspaceItems) categorizedKeys.add(`${item.workspaceId}:${item.sessionId}`)
    }
  }

  const uncategorized = input.tasks.filter((item) => !categorizedKeys.has(`${item.workspaceId}:${item.sessionId}`))
  if (uncategorized.length > 0) {
    groups.push({ key: 'uncategorized', label: '未分类', count: uncategorized.length, items: [...uncategorized] })
  }

  return groups
}

function pushCategoryGroup(
  groups: ConversationGroup[],
  categorizedKeys: Set<string>,
  workspaceId: string,
  workspaceName: string,
  category: SessionCategoryNode,
  tasks: readonly TaskListItem[],
  parentLabel = '',
) {
  const categoryName = isDesktopCategory(category) ? category.name : category.label
  const label = parentLabel ? `${parentLabel} / ${categoryName}` : categoryName
  const sessionKeys = new Set(
    isDesktopCategory(category)
      ? category.sessionRefs.map((ref) => `${ref.workspaceId}:${ref.sessionId}`)
      : (category.sessionIds ?? []).map((sessionId) => `${workspaceId}:${sessionId}`),
  )
  const categoryItems = tasks.filter((item) => sessionKeys.has(`${item.workspaceId}:${item.sessionId}`))
  if (categoryItems.length > 0) {
    groups.push({
      key: `category:${workspaceId}:${category.id}`,
      label: `${workspaceName || '工作区'} · ${label}`,
      count: categoryItems.length,
      items: [...categoryItems],
    })
    for (const item of categoryItems) categorizedKeys.add(`${item.workspaceId}:${item.sessionId}`)
  }
  for (const child of category.children ?? []) {
    pushCategoryGroup(groups, categorizedKeys, workspaceId, workspaceName, child, tasks, label)
  }
}

function categoriesFor(
  record: SessionCategoriesByWorkspace[string] | undefined,
): readonly SessionCategoryNode[] {
  if (!record) return []
  return 'categories' in record ? record.categories : record
}

function isDesktopCategory(category: SessionCategoryNode): category is DesktopSessionCategoryNode {
  return 'name' in category && 'sessionRefs' in category
}
