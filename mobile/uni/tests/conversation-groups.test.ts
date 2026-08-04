import assert from 'node:assert/strict'
import test from 'node:test'
import { buildConversationGroups } from '../src/services/conversation-groups'
import type { LegacySessionCategoryNode, TaskListItem, WorkspaceRecord } from '../src/services/protocol'

function task(id: string, workspaceId = 'ws1'): TaskListItem {
  return {
    workspaceId,
    workspaceName: workspaceId === 'ws1' ? 'pi-gui' : 'go-xl',
    sessionId: id,
    title: `Task ${id}`,
    preview: '',
    status: 'idle',
    updatedAt: '',
    hasUnseenUpdate: false,
  }
}

test('buildConversationGroups uses desktop conversation categories first', () => {
  const workspaces: WorkspaceRecord[] = [{ id: 'ws1', name: 'pi-gui', sessions: [] }]
  const categories: Record<string, LegacySessionCategoryNode[]> = {
    ws1: [{ id: 'mobile', label: '移动端', sessionIds: ['a', 'b'] }],
  }

  const groups = buildConversationGroups({ tasks: [task('a'), task('b'), task('c')], workspaces, sessionCategoriesByWorkspace: categories })

  assert.equal(groups[0].key, 'category:ws1:mobile')
  assert.equal(groups[0].label, 'pi-gui · 移动端')
  assert.deepEqual(groups[0].items.map((item) => item.sessionId), ['a', 'b'])
  assert.equal(groups[1].key, 'workspace:ws1')
  assert.deepEqual(groups[1].items.map((item) => item.sessionId), ['c'])
})

test('buildConversationGroups reads the desktop session category schema', () => {
  const workspaces: WorkspaceRecord[] = [{ id: 'ws1', name: 'pi-gui', sessions: [] }]
  const desktopCategories = {
    ws1: {
      version: 1 as const,
      categories: [{
        id: 'mobile',
        name: '移动端',
        sessionRefs: [{ workspaceId: 'ws1', sessionId: 'a' }],
        children: [],
      }],
    },
  }

  const groups = buildConversationGroups({ tasks: [task('a'), task('b')], workspaces, sessionCategoriesByWorkspace: desktopCategories })

  assert.equal(groups[0].key, 'category:ws1:mobile')
  assert.equal(groups[0].label, 'pi-gui · 移动端')
  assert.deepEqual(groups[0].items.map((item) => item.sessionId), ['a'])
  assert.deepEqual(groups[1].items.map((item) => item.sessionId), ['b'])
})

test('buildConversationGroups falls back to uncategorized for unknown workspace tasks', () => {
  const groups = buildConversationGroups({ tasks: [task('a', 'missing')], workspaces: [], sessionCategoriesByWorkspace: {} })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].key, 'uncategorized')
  assert.equal(groups[0].label, '未分类')
  assert.equal(groups[0].count, 1)
})
