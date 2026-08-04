import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

function pngDimensions(path: string): { width: number; height: number } {
  const data = readFileSync(path)
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${path} is not a PNG`)
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  }
}

test('app startup restores connection and accessibility settings', () => {
  const app = source('src/App.vue')
  assert.match(app, /loadSettings\(\)/)
  assert.match(app, /connectSavedSettings\(\)/)
  assert.match(app, /loadAccessibilitySettings\(\)/)
  assert.doesNotMatch(app, /pi_[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(app, /UI test phone/)
})

test('accessibility settings provide persistent simple mode and three text sizes', () => {
  const accessibility = source('src/services/accessibility.ts')
  const settings = source('src/pages/settings/index.vue')
  assert.match(accessibility, /textScale:\s*'large'/)
  assert.match(accessibility, /simpleMode:\s*true/)
  assert.match(accessibility, /setStorageSync/)
  assert.match(settings, /setTextScale/)
  assert.match(settings, /标准/)
  assert.match(settings, /大字/)
  assert.match(settings, /特大/)
  assert.match(settings, /简洁模式/)
})

test('all four pages apply the shared accessibility text class', () => {
  for (const page of [
    'src/pages/tasks/index.vue',
    'src/pages/notifications/index.vue',
    'src/pages/settings/index.vue',
    'src/pages/conversation/index.vue',
  ]) {
    assert.match(source(page), /textScaleClass/, page)
  }
})

test('mobile command permissions default to enabled so the caregiver phone can act', () => {
  const relay = source('src/services/relay.ts')
  assert.match(relay, /sendMessages: true/)
  assert.match(relay, /stopRuns: true/)
  assert.match(relay, /createSessions: true/)
})

test('native tab bar uses visible production-sized icons and large labels', () => {
  const pages = JSON.parse(source('src/pages.json')) as {
    tabBar?: { fontSize?: string; iconWidth?: string; height?: string }
  }
  assert.equal(pages.tabBar?.fontSize, '16px')
  assert.equal(pages.tabBar?.iconWidth, '30px')
  assert.equal(pages.tabBar?.height, '60px')

  for (const name of [
    'tab-chat.png',
    'tab-chat-active.png',
    'tab-tasks.png',
    'tab-tasks-active.png',
    'tab-settings.png',
    'tab-settings-active.png',
  ]) {
    const { width, height } = pngDimensions(`src/static/${name}`)
    assert.ok(width >= 24, `${name} width is ${width}`)
    assert.ok(height >= 24, `${name} height is ${height}`)
  }
})

test('conversation list uses a functional search input and no emoji UI icons', () => {
  const tasks = source('src/pages/tasks/index.vue')
  assert.match(tasks, /<input[^>]+v-model="searchQuery"/s)
  assert.doesNotMatch(tasks, /📁|🎤|‹/u)
})

test('conversation composer uses image icon controls and requests microphone permission', () => {
  const conversation = source('src/pages/conversation/index.vue')
  const speech = source('src/services/speech.ts')
  assert.match(conversation, /icon-mic/)
  assert.match(conversation, /icon-send/)
  assert.doesNotMatch(conversation, /🎤|⬤|‹/u)
  assert.match(speech, /requestPermissions/)
})

test('sync and send actions always give feedback instead of silently doing nothing', () => {
  const conversation = source('src/pages/conversation/index.vue')
  // Send button is always tappable (not :disabled) so a blocked permission still shows a toast.
  assert.doesNotMatch(conversation, /send-icon-button"[^>]*:disabled/)
  assert.match(conversation, /send-icon-button--inactive/)
  assert.match(conversation, /开放“发送消息”权限/)
  // Sync button is also always tappable and routes through feedback-aware handler.
  assert.doesNotMatch(conversation, /同步详情"[^>]*:disabled/)
  assert.match(conversation, /uni\.showLoading\(\{\s*title: '同步中…'/)
  assert.match(conversation, /尚未连接，请先到设置页完成配对/)
  assert.match(conversation, /Windows 端未开放“对话详情”权限/)
})

test('all mobile pages use one custom header instead of duplicate native titles', () => {
  const pages = source('src/pages.json')
  const matches = pages.match(/"navigationStyle"\s*:\s*"custom"/g) ?? []
  assert.equal(matches.length, 4)
})

test('conversation detail shows rich message rendering, copy, and quick replies', () => {
  const conversation = source('src/pages/conversation/index.vue')
  // 工具/总结/活动区分渲染
  assert.match(conversation, /message--tool/)
  assert.match(conversation, /message--summary/)
  assert.match(conversation, /toolStatusLabel/)
  // 时间戳 + 长按复制
  assert.match(conversation, /messageTime\(message\)/)
  assert.match(conversation, /@longpress="onCopyMessage\(message\)"/)
  assert.match(conversation, /setClipboardData/)
  // 大按钮快捷回复（护理员/老人一键发送）
  assert.match(conversation, /quickReplies/)
  assert.match(conversation, /请继续/)
  assert.match(conversation, /简化步骤/)
  assert.doesNotMatch(conversation, /🎤|⬤|🆗|📖|📝|🎯/u)
  assert.match(conversation, /height:\s*var\(--app-control-height/) 
})

test('notification items with session targets open the conversation', () => {
  const notifications = source('src/pages/notifications/index.vue')
  assert.match(notifications, /openNotification\(item\)/)
  assert.match(notifications, /navigateTo\(\{\s*url: '\/pages\/conversation\/index'/)
  assert.match(notifications, /分钟前/)
  assert.match(notifications, /activity-chevron/)
})

test('conversation list shows unread total badge and supports pull-to-refresh', () => {
  const tasks = source('src/pages/tasks/index.vue')
  assert.match(tasks, /filterCounts\.unread/)
  assert.match(tasks, /unread-total/)
  assert.match(tasks, /refresher-enabled/)
  assert.match(tasks, /onRefresh\(\)/)
  assert.match(tasks, /import \{[^}]*selectCurrentTask[^}]*\} from '@\/services\/relay'/s)
  assert.match(tasks, /requestTranscript\(current\.workspaceId/)
})

test('conversation list shows recent sessions instead of a running-only filter', () => {
  const tasks = source('src/pages/tasks/index.vue')
  const conversation = source('src/pages/conversation/index.vue')
  // 过滤从“运行中”改为“最近”：展示今天/24小时内运行过的会话
  assert.match(tasks, /'all' \| 'recent' \| 'unread' \| 'failed'/)
  assert.match(tasks, /recent: '最近'/)
  assert.match(tasks, /function isRecent\(/)
  assert.match(tasks, /86_400_000/)
  assert.match(tasks, /is-recent/)
  assert.doesNotMatch(tasks, /'运行中'/)
  // 详情页状态同样不显示“运行中”
  assert.match(conversation, /if \(status === 'running'\) return '最近'/)
  assert.doesNotMatch(conversation, /return '运行中'/)
})
