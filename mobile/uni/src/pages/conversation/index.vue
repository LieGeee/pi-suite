<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { requestTranscript, selectCurrentTask, selectTranscript, sendMessage, stopRun, store } from '@/services/relay'
import { accessibility, textScaleClass } from '@/services/accessibility'
import type { TranscriptMessage } from '@/services/protocol'
import {
  cancelListening,
  finalText,
  initializeSpeech,
  interimText,
  isSupported as speechSupported,
  speechState,
  startListening,
  stopListening,
} from '@/services/speech'

const composerText = ref('')
const scrollAnchor = ref('')
const voiceBaseText = ref('')
const currentTask = computed(() => selectCurrentTask(store))
const transcript = computed(() => selectTranscript(store, currentTask.value?.workspaceId, currentTask.value?.sessionId))
const permissions = computed(() => store.permissions)
const canSend = computed(() => Boolean(currentTask.value && composerText.value.trim() && permissions.value.sendMessages))
const isListening = computed(() => speechState.value === 'recording' || speechState.value === 'requesting-permission')
const isVoiceBusy = computed(() => isListening.value || speechState.value === 'processing')

watch(transcript, async () => {
  if (transcript.value.length > 0) uni.hideLoading()
  await nextTick()
  scrollAnchor.value = ''
  await nextTick()
  scrollAnchor.value = 'message-end'
}, { deep: true })

watch(interimText, (text) => {
  if (text && isVoiceBusy.value) composerText.value = [voiceBaseText.value, text].filter(Boolean).join(' ')
})

watch(finalText, (text) => {
  if (text) composerText.value = [voiceBaseText.value, text].filter(Boolean).join(' ')
})

onMounted(() => {
  initializeSpeech()
  const task = currentTask.value
  if (task && permissions.value.conversationDetails && transcript.value.length === 0) {
    requestTranscript(task.workspaceId, task.sessionId)
  }
})

onBeforeUnmount(() => cancelListening())

async function toggleRecording() {
  if (speechState.value === 'recording') {
    stopListening()
    return
  }
  if (speechState.value === 'requesting-permission' || speechState.value === 'processing') return

  voiceBaseText.value = composerText.value.trim()
  try {
    const text = await startListening({ language: 'zh-CN' })
    if (text) composerText.value = [voiceBaseText.value, text].filter(Boolean).join(' ')
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : String(error), icon: 'none', duration: 2600 })
  }
}

function onSendMessage() {
  const task = currentTask.value
  const text = composerText.value.trim()
  if (!task) {
    uni.showToast({ title: '请先选择要发送的对话', icon: 'none' })
    return
  }
  if (!text) {
    uni.showToast({ title: '请先输入消息内容', icon: 'none' })
    return
  }
  if (!permissions.value.sendMessages) {
    uni.showToast({ title: '请先在 Windows 设置中开放“发送消息”权限', icon: 'none', duration: 3200 })
    return
  }
  const commandId = sendMessage(task.workspaceId, task.sessionId, text)
  if (!commandId) {
    uni.showToast({ title: '连接不可用，请先到设置页确认已连接', icon: 'none', duration: 2600 })
    return
  }
  composerText.value = ''
  voiceBaseText.value = ''
}

function onRequestTranscript() {
  const task = currentTask.value
  if (!task) return
  if (store.connectionStatus !== 'connected') {
    uni.showToast({ title: '尚未连接，请先到设置页完成配对', icon: 'none', duration: 2600 })
    return
  }
  if (!permissions.value.conversationDetails) {
    uni.showToast({ title: 'Windows 端未开放“对话详情”权限，请先在 Windows 开启', icon: 'none', duration: 3200 })
    return
  }
  uni.showLoading({ title: '同步中…', mask: true })
  const commandId = requestTranscript(task.workspaceId, task.sessionId)
  if (!commandId) {
    uni.hideLoading()
    uni.showToast({ title: '连接不可用，请稍后重试', icon: 'none' })
    return
  }
  // 等待桌面端回传后隐藏 loading；若长时间无回传则自动隐藏
  setTimeout(() => uni.hideLoading(), 5000)
}

function onStopRun() {
  const task = currentTask.value
  if (task && permissions.value.stopRuns) stopRun(task.workspaceId, task.sessionId)
}

function roleLabel(message: TranscriptMessage): string {
  if (message.role === 'user') return '你'
  if (message.role === 'assistant') return 'pi'
  if (message.kind === 'tool') {
    const name = typeof message.toolName === 'string' ? message.toolName : ''
    return name ? `工具:${name}` : '工具'
  }
  if (message.kind === 'summary') return '总结'
  if (message.kind === 'activity') return '动态'
  return '状态'
}

function messageText(message: TranscriptMessage): string {
  return String(
    message.text ?? message.title ?? message.label ?? message.detail ?? message.status ?? '状态更新'
  )
}

function toolStatusLabel(message: TranscriptMessage): string {
  const status = message.status ?? message.toolStatus
  if (status === 'success') return '完成'
  if (status === 'error' || status === 'failed') return '失败'
  if (status === 'running') return '进行中'
  if (status === 'warning') return '注意'
  return status ? String(status) : ''
}

function messageClass(message: TranscriptMessage): string {
  if (message.role === 'user') return 'message--user'
  if (message.role === 'assistant') return 'message--assistant'
  if (message.kind === 'tool') return 'message--tool'
  if (message.kind === 'summary') return 'message--summary'
  return 'message--event'
}

function messageTime(message: TranscriptMessage): string {
  const raw = message.createdAt ?? message.timestamp
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function isToolMessage(message: TranscriptMessage): boolean {
  return messageClass(message) === 'message--tool'
}

function onCopyMessage(message: TranscriptMessage): void {
  const text = messageText(message)
  if (text) uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '已复制', icon: 'none' }) })
}

const quickReplies = [
  { label: '好的', text: '好的' },
  { label: '简单解释', text: '请用简单的话解释一下' },
  { label: '请继续', text: '请继续' },
  { label: '简化步骤', text: '请给一个简化步骤' },
] as const

function onQuickReply(text: string) {
  composerText.value = text
}

function statusLabel(status?: string): string {
  if (status === 'running') return '最近'
  if (status === 'failed') return '失败'
  return '空闲'
}

function goBack() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/tasks/index' }) })
}
</script>

<template>
  <view :class="['conversation-page', textScaleClass, { 'simple-mode': accessibility.simpleMode }]">
    <view class="app-safe-top detail-header">
      <view class="detail-toolbar">
        <button class="icon-button" aria-label="返回" @tap="goBack">
          <image class="icon" src="/static/icon-chevron-left.png" mode="aspectFit" />
        </button>
        <view class="detail-title-wrap">
          <text class="detail-title">{{ currentTask?.title || '对话' }}</text>
          <view v-if="currentTask" class="detail-meta-row">
            <text :class="['detail-status-dot', `detail-status-dot--${currentTask.status}`]" />
            <text class="detail-meta">{{ currentTask.workspaceName }} · {{ statusLabel(currentTask.status) }}</text>
          </view>
        </view>
        <button class="icon-button" :class="{ 'icon-button--inactive': !permissions.conversationDetails }" aria-label="同步详情" @tap="onRequestTranscript">
          <image class="icon" src="/static/icon-refresh-cw.png" mode="aspectFit" />
        </button>
        <button v-if="currentTask?.status === 'running'" class="stop-button" aria-label="停止任务" :disabled="!permissions.stopRuns" @tap="onStopRun">
          <image src="/static/icon-stop-white.png" mode="aspectFit" />
        </button>
      </view>
    </view>

    <scroll-view class="message-scroll" scroll-y :scroll-into-view="scrollAnchor" :show-scrollbar="false">
      <view v-if="!currentTask" class="detail-empty">
        <text class="detail-empty-title">没有选择对话</text>
        <text class="detail-empty-body">返回列表后选择一个对话。</text>
        <button class="primary-button detail-empty-action" @tap="goBack">返回列表</button>
      </view>

      <view v-else-if="transcript.length === 0" class="detail-empty">
        <view class="empty-symbol"><image src="/static/icon-refresh-cw.png" mode="aspectFit" /></view>
        <text class="detail-empty-title">正在获取消息</text>
        <text class="detail-empty-body">如果长时间没有内容，请确认 Windows 端已开放“对话详情”权限。</text>
        <button class="secondary-button detail-empty-action" :class="{ 'icon-button--inactive': !permissions.conversationDetails }" @tap="onRequestTranscript">重新同步</button>
      </view>

      <view v-else class="message-list">
        <view
          v-for="(message, index) in transcript"
          :key="message.id ?? index"
          :class="['message-row', messageClass(message)]"
          @longpress="onCopyMessage(message)"
        >
          <view v-if="messageClass(message) !== 'message--event' && messageClass(message) !== 'message--summary'" class="message-avatar">{{ roleLabel(message).slice(0, 2) }}</view>
          <view class="message-content" :class="isToolMessage(message) ? 'message-content--tool' : ''">
            <view class="message-head">
              <text class="message-role">{{ roleLabel(message) }}</text>
              <text v-if="isToolMessage(message) && toolStatusLabel(message)" :class="['tool-badge', `tool-badge--${toolStatusLabel(message)}`]">{{ toolStatusLabel(message) }}</text>
              <text class="message-time">{{ messageTime(message) }}</text>
            </view>
            <text class="message-text" selectable>{{ messageText(message) }}</text>
          </view>
        </view>
      </view>
      <view id="message-end" class="message-end" />
    </scroll-view>

    <view class="composer-shell">
      <scroll-view v-if="permissions.sendMessages" class="quick-replies" scroll-x :show-scrollbar="false">
        <view class="quick-reply-row">
          <button
            v-for="reply in quickReplies"
            :key="reply.text"
            class="quick-reply-chip"
            @tap="onQuickReply(reply.text)"
          >{{ reply.label }}</button>
        </view>
      </scroll-view>
      <view v-if="!permissions.sendMessages" class="permission-note">Windows 端尚未开放发送权限，仍可先编辑内容</view>
      <view v-if="isVoiceBusy" class="voice-status">
        <text class="voice-live-dot" />
        <text>{{ speechState === 'processing' ? '正在识别…' : speechState === 'requesting-permission' ? '等待麦克风权限…' : '正在聆听，再点一次结束' }}</text>
      </view>
      <view class="composer-bar">
        <button :class="['tool-button', speechState === 'recording' ? 'tool-button--recording' : '']" aria-label="语音输入" @tap="toggleRecording">
          <image class="icon-mic" src="/static/icon-mic.png" mode="aspectFit" />
        </button>
        <textarea
          v-model="composerText"
          class="composer-input"
          :placeholder="speechSupported ? '输入消息' : '输入消息（此设备无语音服务）'"
          auto-height
          :maxlength="-1"
          cursor-spacing="18"
          confirm-type="send"
          :show-confirm-bar="false"
          adjust-position
          @confirm="onSendMessage"
        />
        <button class="send-icon-button" :class="{ 'send-icon-button--inactive': !canSend }" aria-label="发送" @tap="onSendMessage">
          <image class="icon-send" src="/static/icon-send.png" mode="aspectFit" />
        </button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.conversation-page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: #f5f6f8; color: #17191c; }
.detail-header { flex-shrink: 0; background: rgba(255, 255, 255, .98); border-bottom: 1rpx solid #e5e7ea; }
.detail-toolbar { min-height: var(--app-header-height, 104rpx); padding: 10rpx 16rpx; display: flex; align-items: center; gap: 4rpx; }
.detail-title-wrap { flex: 1; min-width: 0; padding: 0 8rpx; }
.detail-title { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--font-title, 29rpx); line-height: 1.25; font-weight: 700; }
.detail-meta-row { margin-top: 5rpx; display: flex; align-items: center; gap: 8rpx; }
.detail-status-dot { width: 11rpx; height: 11rpx; border-radius: 50%; background: #a5a9b0; flex-shrink: 0; }
.detail-status-dot--running { background: #18a558; }
.detail-status-dot--failed { background: #d7463e; }
.detail-meta { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #7a8089; font-size: var(--font-meta, 21rpx); }
.stop-button { width: 68rpx; height: 68rpx; margin: 0 0 0 2rpx; padding: 0; display: flex; align-items: center; justify-content: center; border: none; border-radius: 16rpx; background: #d7463e; }
.icon-button--inactive { opacity: .55; }
.stop-button image { width: 30rpx; height: 30rpx; }
.message-scroll { flex: 1; min-height: 0; }
.message-list { padding: 28rpx 24rpx; }
.message-row { display: flex; align-items: flex-start; gap: 14rpx; margin-bottom: 28rpx; }
.message-row.message--user { flex-direction: row-reverse; }
.message-row.message--event { margin: 14rpx 28rpx 26rpx; justify-content: center; }
.message-row.message--summary { margin: 14rpx 8rpx 26rpx; justify-content: center; }
.message-row.message--tool { align-items: flex-start; }
.message-avatar { width: 54rpx; height: 54rpx; border-radius: 14rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #e3e7ed; color: #3f454e; font-size: 20rpx; font-weight: 750; }
.message--user .message-avatar { background: #262a30; color: #fff; }
.message-content { max-width: 76%; padding: 18rpx 20rpx; border: 1rpx solid #e4e6e9; border-radius: 16rpx; background: #fff; }
.message--user .message-content { max-width: 74%; background: #25292f; border-color: #25292f; }
.message--event .message-content { max-width: 100%; padding: 10rpx 18rpx; border: none; border-radius: 16rpx; background: #e9ebee; text-align: center; }
.message--summary .message-content { max-width: 92%; padding: 16rpx 20rpx; border: 1rpx dashed #c9ced6; border-radius: 16rpx; background: #f4f6f9; }
.message-content--tool { border-left: 6rpx solid #b9bdc4; border-radius: 10rpx; background: #f7f8fa; }
.message-head { display: flex; align-items: center; gap: 12rpx; margin-bottom: 7rpx; }
.message-role { color: #888e97; font-size: var(--font-meta, 20rpx); font-weight: 650; }
.message--user .message-role { color: #bcc0c6; }
.message--event .message-role { display: none; }
.message-time { margin-left: auto; color: #a4a9b1; font-size: var(--font-meta, 20rpx); flex-shrink: 0; }
.tool-badge { padding: 2rpx 12rpx; border-radius: 999rpx; font-size: var(--font-meta, 20rpx); font-weight: 650; }
.tool-badge--完成 { background: #e4f5ea; color: #15804a; }
.tool-badge--失败 { background: #feeceb; color: #c43d36; }
.tool-badge--进行中 { background: #fff4de; color: #b26c00; }
.tool-badge--注意 { background: #fff0e0; color: #b26c00; }
.tool-badge--warning { background: #fff0e0; color: #b26c00; }
.message-text { display: block; color: #22262b; font-size: var(--font-body, 27rpx); line-height: 1.58; word-break: break-word; }
.message--user .message-text { color: #fff; }
.message--event .message-text { color: #656b74; font-size: var(--font-meta, 22rpx); line-height: 1.45; }
.message--summary .message-text { color: #3a4048; }
.message-end { height: 18rpx; }
.detail-empty { min-height: 680rpx; padding: 160rpx 64rpx 80rpx; display: flex; flex-direction: column; align-items: center; text-align: center; }
.empty-symbol { width: 88rpx; height: 88rpx; display: flex; align-items: center; justify-content: center; border-radius: 16rpx; background: #e9edf3; }
.empty-symbol image { width: 40rpx; height: 40rpx; }
.detail-empty-title { margin-top: 26rpx; font-size: var(--font-title, 30rpx); font-weight: 700; }
.detail-empty-body { margin-top: 12rpx; color: #777d86; font-size: var(--font-body, 25rpx); line-height: 1.6; }
.detail-empty-action { min-width: 220rpx; margin-top: 30rpx; }
.composer-shell { flex-shrink: 0; padding: 12rpx 16rpx calc(12rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #e5e7ea; }
.quick-replies { height: var(--app-control-height, 76rpx); margin: 0 2rpx 10rpx; white-space: nowrap; }
.quick-reply-row { height: var(--app-control-height, 76rpx); display: inline-flex; align-items: center; gap: 12rpx; padding: 0 4rpx; }
.quick-reply-chip { min-height: calc(var(--app-control-height, 76rpx) - 14rpx); margin: 0; padding: 0 24rpx; display: inline-flex; align-items: center; border: 1rpx solid #d8dce2; border-radius: 12rpx; background: #fff; color: #333840; font-size: var(--font-body, 25rpx); font-weight: 600; line-height: 1.2; }
.quick-reply-chip:active { background: #eceef1; }
.permission-note { margin: 0 6rpx 10rpx; color: #a36a00; font-size: var(--font-meta, 21rpx); }
.voice-status { min-height: 48rpx; margin: -2rpx 6rpx 8rpx; display: flex; align-items: center; gap: 10rpx; color: #5e646d; font-size: var(--font-meta, 22rpx); }
.voice-live-dot { width: 13rpx; height: 13rpx; border-radius: 50%; background: #d7463e; animation: voice-pulse 1s ease-in-out infinite; }
.composer-bar { min-height: 80rpx; display: flex; align-items: flex-end; gap: 10rpx; }
.tool-button,
.send-icon-button { width: 76rpx; height: 76rpx; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: none; border-radius: 16rpx; line-height: 1; }
.tool-button { background: #eceef1; }
.tool-button--recording { background: #feeceb; }
.icon-mic { width: 36rpx; height: 36rpx; }
.tool-button--recording .icon-mic { opacity: .7; }
.composer-input { flex: 1; min-width: 0; min-height: var(--app-control-height, 76rpx); max-height: 240rpx; padding: 18rpx 20rpx; border-radius: 16rpx; background: #f0f1f3; color: #17191c; font-size: var(--font-control, 27rpx); line-height: 1.45; }
.send-icon-button { background: #17191c; }
.send-icon-button--inactive { background: #b9bdc4; }
.icon-send { width: 34rpx; height: 34rpx; }
@keyframes voice-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
</style>
