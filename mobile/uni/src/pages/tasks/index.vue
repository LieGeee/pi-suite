<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { requestTranscript, selectCurrentTask, selectTask, selectTasks, store } from '@/services/relay'
import { accessibility, textScaleClass } from '@/services/accessibility'
import { buildConversationGroups } from '@/services/conversation-groups'
import type { ConnectionStatus, TaskListItem } from '@/services/protocol'

type FilterKey = 'all' | 'recent' | 'unread' | 'failed'

const activeFilter = ref<FilterKey>('all')
const collapsedGroups = ref<Record<string, boolean>>({})
const searchQuery = ref('')
const refreshing = ref(false)
const visibleFilters = computed<FilterKey[]>(() => accessibility.simpleMode
  ? ['all', 'recent']
  : ['all', 'recent', 'unread', 'failed'])

watch(() => accessibility.simpleMode, (enabled) => {
  if (enabled && activeFilter.value !== 'all' && activeFilter.value !== 'recent') {
    activeFilter.value = 'all'
  }
})

// “最近”= 今天/最近 24 小时内运行过、或正在运行的会话（对齐电脑端的最近会话）
function isRecent(item: TaskListItem): boolean {
  if (item.status === 'running') return true
  if (!item.updatedAt) return false
  const diff = Date.now() - new Date(item.updatedAt).getTime()
  return Number.isFinite(diff) && diff >= 0 && diff < 86_400_000
}

const tasks = computed(() => selectTasks(store))
const filterCounts = computed(() => ({
  all: tasks.value.length,
  recent: tasks.value.filter(isRecent).length,
  unread: tasks.value.filter((item) => item.hasUnseenUpdate).length,
  failed: tasks.value.filter((item) => item.status === 'failed').length,
}))
const filteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return tasks.value.filter((item) => {
    const matchesFilter = activeFilter.value === 'all'
      || (activeFilter.value === 'recent' && isRecent(item))
      || (activeFilter.value === 'unread' && item.hasUnseenUpdate)
      || (activeFilter.value === 'failed' && item.status === 'failed')
    if (!matchesFilter) return false
    if (!query) return true
    return [item.title, item.preview, item.workspaceName, item.workspacePath]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(query))
  })
})
const conversationGroups = computed(() => buildConversationGroups({
  tasks: filteredTasks.value,
  workspaces: store.workspaces,
  sessionCategoriesByWorkspace: store.sessionCategoriesByWorkspace,
}))
const emptyState = computed(() => getEmptyState())
const connectionHint = computed(() => getConnectionHint(store.connectionStatus))

function getEmptyState() {
  if (store.connectionStatus === 'idle') {
    return { title: '尚未连接', body: '前往设置，扫描 Windows 端二维码完成配对。', action: '打开设置' }
  }
  if (store.connectionStatus === 'connecting') {
    return { title: '正在连接', body: '正在恢复与 relay 的连接。', action: '' }
  }
  if (store.connectionStatus === 'auth-failed') {
    return { title: '配对已失效', body: store.lastError || '请重新扫描 Windows 端二维码。', action: '重新配对' }
  }
  if (store.connectionStatus === 'disconnected') {
    return { title: '连接中断', body: store.lastError || '请检查网络后重试。', action: '检查设置' }
  }
  if (searchQuery.value.trim()) {
    return { title: '没有匹配结果', body: '换一个关键词，或清空搜索条件。', action: '' }
  }
  if (activeFilter.value !== 'all' && tasks.value.length > 0) {
    return { title: '此视图为空', body: '切换到“全部”查看其它对话。', action: '' }
  }
  return { title: '等待桌面同步', body: '连接已建立，正在等待 Windows 端发送对话列表。', action: '查看设置' }
}

function getConnectionHint(status: ConnectionStatus): string {
  if (status === 'connected') return tasks.value.length ? `${tasks.value.length} 个对话` : '等待桌面同步'
  return ({
    idle: '未连接',
    connecting: '连接中',
    connected: '已连接',
    disconnected: '已断开',
    'auth-failed': '配对失效',
  } satisfies Record<ConnectionStatus, string>)[status]
}

function filterLabel(key: FilterKey): string {
  return ({ all: '全部', recent: '最近', unread: '未读', failed: '失败' } satisfies Record<FilterKey, string>)[key]
}

function statusClass(item: TaskListItem): string {
  if (isRecent(item)) return 'is-recent'
  if (item.status === 'failed') return 'is-failed'
  return 'is-idle'
}

function statusText(item: TaskListItem): string {
  if (isRecent(item)) return '最近'
  if (item.status === 'failed') return '失败'
  return ''
}

function formatTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function avatarText(item: TaskListItem): string {
  return (item.workspaceName || item.title || 'PI').slice(0, 2).toUpperCase()
}

function toggleGroup(key: string) {
  collapsedGroups.value = { ...collapsedGroups.value, [key]: !collapsedGroups.value[key] }
}

function onSelectConversation(item: TaskListItem) {
  selectTask(item.workspaceId, item.sessionId)
  store.selectedWorkspaceId = item.workspaceId
  store.selectedSessionId = item.sessionId
  if (store.permissions.conversationDetails) requestTranscript(item.workspaceId, item.sessionId)
  uni.navigateTo({ url: '/pages/conversation/index' })
}

function goSettings() {
  uni.switchTab({ url: '/pages/settings/index' })
}

function onRefresh() {
  refreshing.value = true
  const current = selectCurrentTask(store)
  if (current && store.connectionStatus === 'connected' && store.permissions.conversationDetails) {
    requestTranscript(current.workspaceId, current.sessionId)
  }
  setTimeout(() => {
    refreshing.value = false
  }, 1200)
}
</script>

<template>
  <view :class="['conversations-page', textScaleClass, { 'simple-mode': accessibility.simpleMode }]">
    <view class="app-safe-top page-header">
      <view class="header-row">
        <view>
          <text class="page-title">对话</text>
          <view class="connection-line">
            <text :class="['connection-dot', `connection-dot--${store.connectionStatus}`]" />
            <text class="header-meta">{{ connectionHint }}</text>
            <text v-if="filterCounts.unread" class="unread-total" aria-label="未读">{{ filterCounts.unread }}</text>
          </view>
        </view>
        <button class="icon-button" aria-label="打开设置" @tap="goSettings">
          <image class="icon" src="/static/tab-settings.png" mode="aspectFit" />
        </button>
      </view>

      <view class="search-field">
        <image class="search-icon" src="/static/icon-search.png" mode="aspectFit" />
        <input
          v-model="searchQuery"
          class="search-input"
          type="text"
          confirm-type="search"
          placeholder="搜索标题、项目或内容"
          placeholder-class="search-placeholder"
        />
        <text v-if="searchQuery" class="clear-search" @tap="searchQuery = ''">清除</text>
      </view>

      <scroll-view class="filter-scroll" scroll-x :show-scrollbar="false">
        <view class="filter-row">
          <button
            v-for="key in visibleFilters"
            :key="key"
            :class="['filter-tab', activeFilter === key ? 'filter-tab--active' : '']"
            @tap="activeFilter = key"
          >
            {{ filterLabel(key) }}<text class="filter-count">{{ filterCounts[key] }}</text>
          </button>
        </view>
      </scroll-view>
    </view>

    <scroll-view class="conversation-scroll" scroll-y refresher-enabled :refresher-triggered="refreshing" :refresher-threshold="40" @refresherrefresh="onRefresh" :show-scrollbar="false">
      <view v-if="conversationGroups.length === 0" class="empty-state">
        <view class="empty-icon"><image src="/static/icon-message-circle.png" mode="aspectFit" /></view>
        <text class="empty-title">{{ emptyState.title }}</text>
        <text class="empty-body">{{ emptyState.body }}</text>
        <button v-if="emptyState.action" class="primary-button empty-action" @tap="goSettings">{{ emptyState.action }}</button>
      </view>

      <view v-for="group in conversationGroups" :key="group.key" class="group-section">
        <view class="group-header" @tap="toggleGroup(group.key)">
          <view class="group-label-wrap">
            <image class="group-icon" src="/static/icon-folder.png" mode="aspectFit" />
            <text class="group-title">{{ group.label }}</text>
            <text class="group-count">{{ group.count }}</text>
          </view>
          <image :class="['chevron', collapsedGroups[group.key] ? 'chevron--collapsed' : '']" src="/static/icon-chevron-down.png" mode="aspectFit" />
        </view>

        <view v-if="!collapsedGroups[group.key]" class="conversation-list">
          <view
            v-for="item in group.items"
            :key="`${item.workspaceId}:${item.sessionId}`"
            class="conversation-item"
            @tap="onSelectConversation(item)"
          >
            <view class="avatar">
              <text>{{ avatarText(item) }}</text>
              <text :class="['status-dot', statusClass(item)]" />
            </view>
            <view class="conversation-main">
              <view class="conversation-topline">
                <text class="conversation-title">{{ item.title }}</text>
                <text class="conversation-time">{{ formatTime(item.updatedAt) }}</text>
              </view>
              <view class="conversation-subline">
                <text class="conversation-preview">{{ item.preview || item.workspaceName || '暂无内容' }}</text>
                <text v-if="statusText(item)" :class="['status-text', statusClass(item)]">{{ statusText(item) }}</text>
                <text v-else-if="item.hasUnseenUpdate" class="unread-dot" />
              </view>
            </view>
          </view>
        </view>
      </view>
      <view class="scroll-spacer" />
    </scroll-view>
  </view>
</template>

<style scoped>
.conversations-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  color: #17191c;
}
.page-header {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1rpx solid #e7e9ed;
}
.header-row {
  height: var(--app-header-height, 112rpx);
  padding: 18rpx 24rpx 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-title {
  display: block;
  font-size: var(--font-page-title, 40rpx);
  line-height: 48rpx;
  font-weight: 760;
}
.connection-line {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 4rpx;
}
.connection-dot,
.status-dot,
.unread-dot {
  display: block;
  border-radius: 50%;
}
.connection-dot { width: 12rpx; height: 12rpx; background: #a5a9b0; }
.connection-dot--connected { background: #18a558; }
.connection-dot--connecting { background: #d98b0b; }
.connection-dot--auth-failed,
.connection-dot--disconnected { background: #d7463e; }
.header-meta { color: #777d86; font-size: var(--font-meta, 23rpx); }
.unread-total { min-width: 34rpx; height: 34rpx; padding: 0 10rpx; display: inline-flex; align-items: center; justify-content: center; border-radius: 999rpx; background: #d7463e; color: #fff; font-size: var(--font-meta, 20rpx); font-weight: 700; line-height: 34rpx; }
.search-field {
  height: var(--app-control-height, 76rpx);
  margin: 0 24rpx 10rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  gap: 14rpx;
  background: #f1f2f4;
  border-radius: 16rpx;
}
.search-icon { width: 34rpx; height: 34rpx; flex-shrink: 0; }
.search-input { flex: 1; height: var(--app-control-height, 76rpx); min-width: 0; font-size: var(--font-control, 27rpx); color: #17191c; }
.search-placeholder { color: #9a9fa7; }
.clear-search { flex-shrink: 0; color: #5f6570; font-size: var(--font-meta, 24rpx); }
.filter-scroll { height: var(--app-control-height, 76rpx); white-space: nowrap; }
.filter-row { height: var(--app-control-height, 76rpx); padding: 0 16rpx; display: inline-flex; align-items: stretch; gap: 4rpx; }
.filter-tab {
  height: var(--app-control-height, 76rpx);
  min-width: 112rpx;
  margin: 0;
  padding: 0 14rpx;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #737983;
  font-size: var(--font-body, 25rpx);
  line-height: calc(var(--app-control-height, 76rpx) - 4rpx);
  border-bottom: 4rpx solid transparent;
}
.filter-tab--active { color: #17191c; font-weight: 700; border-bottom-color: #17191c; }
.filter-count { margin-left: 8rpx; color: #a0a5ad; font-size: var(--font-meta, 21rpx); }
.conversation-scroll { flex: 1; min-height: 0; }
.group-section { margin-top: 14rpx; background: #fff; border-top: 1rpx solid #eceef1; border-bottom: 1rpx solid #eceef1; }
.group-header { height: 76rpx; padding: 0 24rpx; display: flex; align-items: center; justify-content: space-between; }
.group-label-wrap { min-width: 0; display: flex; align-items: center; gap: 12rpx; }
.group-icon { width: 30rpx; height: 30rpx; flex-shrink: 0; }
.group-title { max-width: 480rpx; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--font-body, 24rpx); font-weight: 650; color: #4e545d; }
.group-count { min-width: 34rpx; height: 34rpx; padding: 0 9rpx; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 10rpx; background: #eef0f3; color: #777d86; font-size: var(--font-meta, 20rpx); line-height: 34rpx; }
.chevron { width: 30rpx; height: 30rpx; transition: transform .18s ease; }
.chevron--collapsed { transform: rotate(-90deg); }
.conversation-list { border-top: 1rpx solid #f0f1f3; }
.conversation-item { min-height: var(--app-list-row-height, 126rpx); padding: 18rpx 24rpx; display: flex; align-items: center; gap: 20rpx; background: #fff; }
.conversation-item:active { background: #f5f6f8; }
.conversation-item + .conversation-item .conversation-main { border-top: 1rpx solid #eceef1; }
.avatar { position: relative; width: 80rpx; height: 80rpx; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #e9edf3; color: #343941; font-size: 23rpx; font-weight: 750; }
.status-dot { position: absolute; right: -3rpx; bottom: -3rpx; width: 18rpx; height: 18rpx; border: 4rpx solid #fff; background: #a5a9b0; }
.status-dot.is-recent { background: #18a558; }
.status-dot.is-failed { background: #d7463e; }
.conversation-main { align-self: stretch; flex: 1; min-width: 0; padding: 12rpx 0; display: flex; flex-direction: column; justify-content: center; }
.conversation-topline,
.conversation-subline { display: flex; align-items: center; gap: 14rpx; }
.conversation-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--font-title, 29rpx); font-weight: 650; color: #17191c; }
.conversation-time { flex-shrink: 0; color: #9ba0a8; font-size: var(--font-meta, 21rpx); }
.conversation-subline { margin-top: 10rpx; }
.conversation-preview { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #777d86; font-size: var(--font-body, 24rpx); }
.status-text { flex-shrink: 0; font-size: var(--font-meta, 21rpx); color: #969ba3; }
.status-text.is-recent { color: #15804a; }
.status-text.is-failed { color: #c43d36; }
.unread-dot { width: 14rpx; height: 14rpx; background: #d7463e; flex-shrink: 0; }
.empty-state { min-height: 620rpx; padding: 140rpx 64rpx 80rpx; display: flex; flex-direction: column; align-items: center; text-align: center; }
.empty-icon { width: 88rpx; height: 88rpx; border-radius: 16rpx; background: #e9edf3; display: flex; align-items: center; justify-content: center; }
.empty-icon image { width: 42rpx; height: 42rpx; }
.empty-title { margin-top: 28rpx; font-size: var(--font-title, 31rpx); font-weight: 700; }
.empty-body { margin-top: 12rpx; color: #777d86; font-size: var(--font-body, 25rpx); line-height: 1.6; }
.empty-action { margin-top: 32rpx; min-width: 220rpx; }
.scroll-spacer { height: 36rpx; }
</style>
