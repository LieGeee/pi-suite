<script setup lang="ts">
import { computed } from 'vue'
import { clearMobileActivity, selectTask, store } from '@/services/relay'
import { accessibility, textScaleClass } from '@/services/accessibility'
import type { NotificationPayload } from '@/services/protocol'

const notifications = computed(() => store.notifications)
const commandErrors = computed(() => store.commandErrors)
const activityCount = computed(() => notifications.value.length + commandErrors.value.length)

function titleOf(item: NotificationPayload): string {
  return item.title || item.kind || '状态更新'
}

function bodyOf(item: NotificationPayload): string {
  return item.body || item.sessionId || item.workspaceId || '桌面端有新的状态更新。'
}

function timeOf(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) {
    const sameDay = date.toDateString() === new Date().toDateString()
    if (sameDay) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return `${Math.floor(diff / 3_600_000)} 小时前`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function clearAll() {
  if (!activityCount.value) return
  clearMobileActivity()
  uni.showToast({ title: '已清空', icon: 'none' })
}

function openNotification(item: NotificationPayload) {
  if (!item.workspaceId || !item.sessionId) return
  selectTask(item.workspaceId, item.sessionId)
  store.selectedWorkspaceId = item.workspaceId
  store.selectedSessionId = item.sessionId
  uni.navigateTo({ url: '/pages/conversation/index' })
}
</script>

<template>
  <view :class="['notifications-page', textScaleClass, { 'simple-mode': accessibility.simpleMode }]">
    <view class="app-safe-top page-header">
      <view class="header-row">
        <view>
          <text class="page-title">通知</text>
          <text class="header-meta">{{ activityCount ? `${activityCount} 条活动` : '暂无新活动' }}</text>
        </view>
        <button class="header-action" :disabled="!activityCount" @tap="clearAll">清空</button>
      </view>
    </view>

    <scroll-view class="activity-scroll" scroll-y :show-scrollbar="false">
      <view v-if="activityCount === 0" class="empty-state">
        <view class="empty-icon"><image src="/static/tab-tasks.png" mode="aspectFit" /></view>
        <text class="empty-title">这里很安静</text>
        <text class="empty-body">任务完成、失败或需要关注时，会在这里留下记录。</text>
      </view>

      <view v-if="commandErrors.length" class="activity-section">
        <text class="section-label">需要处理</text>
        <view class="activity-list activity-list--error">
          <view v-for="item in commandErrors" :key="item.commandId" class="activity-item">
            <view class="activity-symbol activity-symbol--error">
              <image src="/static/icon-circle-alert.png" mode="aspectFit" />
            </view>
            <view class="activity-main">
              <text class="activity-title">操作失败</text>
              <text class="activity-body">{{ item.error }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="notifications.length" class="activity-section">
        <text class="section-label">最近</text>
        <view class="activity-list">
          <view
            v-for="(item, index) in notifications"
            :key="`${item.timestamp ?? index}`"
            :class="['activity-item', item.workspaceId && item.sessionId ? 'activity-item--tappable' : '']"
            @tap="openNotification(item)"
          >
            <view class="activity-symbol">
              <image src="/static/tab-tasks.png" mode="aspectFit" />
            </view>
            <view class="activity-main">
              <view class="activity-topline">
                <text class="activity-title">{{ titleOf(item) }}</text>
                <text class="activity-time">{{ timeOf(item.timestamp) }}</text>
              </view>
              <text class="activity-body">{{ bodyOf(item) }}</text>
            </view>
            <image v-if="item.workspaceId && item.sessionId" class="activity-chevron" src="/static/icon-chevron-down.png" mode="aspectFit" />
          </view>
        </view>
      </view>
      <view class="scroll-spacer" />
    </scroll-view>
  </view>
</template>

<style scoped>
.notifications-page { height: 100vh; display: flex; flex-direction: column; background: #f5f6f8; color: #17191c; }
.page-header { flex-shrink: 0; background: #fff; border-bottom: 1rpx solid #e7e9ed; }
.header-row { min-height: var(--app-header-height, 112rpx); padding: 16rpx 24rpx; display: flex; align-items: center; justify-content: space-between; }
.page-title { display: block; font-size: var(--font-page-title, 40rpx); line-height: 1.2; font-weight: 760; }
.header-meta { display: block; margin-top: 4rpx; color: #777d86; font-size: var(--font-meta, 23rpx); }
.header-action { min-width: 88rpx; min-height: 64rpx; margin: 0; padding: 0 16rpx; border: none; border-radius: 12rpx; background: transparent; color: #4e545d; font-size: var(--font-body, 25rpx); line-height: 1.2; }
.activity-scroll { flex: 1; min-height: 0; }
.activity-section { margin-top: 24rpx; }
.section-label { display: block; margin: 0 24rpx 12rpx; color: #717780; font-size: var(--font-meta, 23rpx); font-weight: 650; }
.activity-list { background: #fff; border-top: 1rpx solid #e7e9ed; border-bottom: 1rpx solid #e7e9ed; }
.activity-list--error { background: #fffafa; }
.activity-item { min-height: 118rpx; padding: 20rpx 24rpx; display: flex; align-items: center; gap: 18rpx; }
.activity-item--tappable:active { background: #f5f6f8; }
.activity-chevron { width: 24rpx; height: 24rpx; opacity: .5; transform: rotate(-90deg); flex-shrink: 0; }
.activity-item + .activity-item .activity-main { border-top: 1rpx solid #eceef1; }
.activity-symbol { width: 62rpx; height: 62rpx; border-radius: 14rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #e9edf3; }
.activity-symbol image { width: 30rpx; height: 30rpx; }
.activity-symbol--error { background: #feeceb; }
.activity-main { flex: 1; min-width: 0; padding: 4rpx 0 12rpx; }
.activity-topline { display: flex; align-items: center; gap: 14rpx; }
.activity-title { flex: 1; min-width: 0; color: #202328; font-size: var(--font-title, 27rpx); font-weight: 680; }
.activity-time { flex-shrink: 0; color: #9a9fa7; font-size: var(--font-meta, 21rpx); }
.activity-body { display: block; margin-top: 7rpx; color: #707680; font-size: var(--font-body, 24rpx); line-height: 1.5; word-break: break-word; }
.empty-state { min-height: 720rpx; padding: 180rpx 64rpx 80rpx; display: flex; flex-direction: column; align-items: center; text-align: center; }
.empty-icon { width: 88rpx; height: 88rpx; border-radius: 16rpx; display: flex; align-items: center; justify-content: center; background: #e9edf3; }
.empty-icon image { width: 42rpx; height: 42rpx; }
.empty-title { margin-top: 28rpx; color: #24282e; font-size: var(--font-title, 31rpx); font-weight: 700; }
.empty-body { max-width: 560rpx; margin-top: 12rpx; color: #777d86; font-size: var(--font-body, 25rpx); line-height: 1.6; }
.scroll-spacer { height: 36rpx; }
</style>
