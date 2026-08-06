<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  deleteItem,
  formatTime,
  getBaseUrl,
  isLoggedIn,
  listAlerts,
  listItems,
  listNews,
  saveBaseUrl,
  triggerRun,
  type AlertItem,
  type MonitorItem,
  type NewsItem,
  parseExtra,
  typeLabel,
} from '@/services/monitor'

type TabKey = 'items' | 'news' | 'alerts'

const activeTab = ref<TabKey>('items')
const items = ref<MonitorItem[]>([])
const news = ref<NewsItem[]>([])
const alerts = ref<AlertItem[]>([])
const loading = ref(false)
const refreshing = ref(false)
const showServer = ref(false)
const serverUrl = ref(getBaseUrl())
const touchStartX = ref(0)
const touchStartY = ref(0)

// 左右滑动切换 tab
function onTouchStart(e: TouchEvent) {
  touchStartX.value = e.touches[0].clientX
  touchStartY.value = e.touches[0].clientY
}

function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX.value
  const dy = e.changedTouches[0].clientY - touchStartY.value
  // 水平滑动 > 60px 且比垂直位移大, 才切换
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const order: TabKey[] = ['items', 'news', 'alerts']
    const idx = order.indexOf(activeTab.value)
    if (dx < 0 && idx < order.length - 1) {
      activeTab.value = order[idx + 1]
    } else if (dx > 0 && idx > 0) {
      activeTab.value = order[idx - 1]
    }
  }
}

const statusTitle = computed(() => {
  const ok = items.value.filter((i) => i.last_status === 'ok').length
  const fail = items.value.filter((i) => i.last_status === 'fail').length
  return `正常 ${ok} · 异常 ${fail} · 共 ${items.value.length}`
})

const filteredNews = computed(() => news.value.slice(0, 30))
const filteredAlerts = computed(() => alerts.value.slice(0, 30))

onShow(() => {
  serverUrl.value = getBaseUrl()
  // 未登录则跳登录页
  if (!isLoggedIn()) {
    uni.reLaunch({ url: '/pages/monitor/login' })
    return
  }
  load()
})

async function load() {
  loading.value = true
  try {
    const [it, nw, al] = await Promise.all([
      listItems(),
      listNews(30),
      listAlerts(30),
    ])
    items.value = it.items
    news.value = nw.news
    alerts.value = al.alerts
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' })
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function onRefresh() {
  refreshing.value = true
  load()
}

function onRunNow() {
  uni.showLoading({ title: '抓取中…' })
  triggerRun()
    .then(() => {
      uni.hideLoading()
      uni.showToast({ title: '已触发，稍后刷新', icon: 'none' })
      setTimeout(load, 8000)
    })
    .catch((e) => {
      uni.hideLoading()
      uni.showToast({ title: (e as Error).message, icon: 'none' })
    })
}

function onToggle(item: MonitorItem) {
  const idx = items.value.findIndex((i) => i.id === item.id)
  if (idx < 0) return
  const next = { ...item, enabled: !item.enabled }
  // 乐观更新
  items.value[idx] = next
  // 通过 service 层完整更新(用当前全部字段)
  const { id, type, name, target, extra, enabled } = next
  import('@/services/monitor').then((m) =>
    m.updateItem(id, { type, name, target, extra, enabled })
      .then(() => uni.showToast({ title: enabled ? '已启用' : '已停用', icon: 'none' }))
      .catch((e) => {
        items.value[idx] = item
        uni.showToast({ title: (e as Error).message, icon: 'none' })
      }),
  )
}

function onDelete(item: MonitorItem) {
  uni.showModal({
    title: '删除监控项',
    content: `确定删除「${item.name}」吗？`,
    confirmColor: '#e5484d',
    success: (res) => {
      if (!res.confirm) return
      deleteItem(item.id)
        .then(() => {
          items.value = items.value.filter((i) => i.id !== item.id)
          uni.showToast({ title: '已删除', icon: 'none' })
        })
        .catch((e) => uni.showToast({ title: (e as Error).message, icon: 'none' }))
    },
  })
}

function onEdit(item: MonitorItem) {
  uni.navigateTo({ url: `/pages/monitor/edit?id=${item.id}` })
}

function onAdd() {
  uni.navigateTo({ url: '/pages/monitor/edit' })
}

function onOpenNews(n: NewsItem) {
  if (n.url) {
    // #ifdef H5
    window.open(n.url, '_blank')
    // #endif
    // #ifndef H5
    uni.setClipboardData({ data: n.url, success: () => uni.showToast({ title: '链接已复制', icon: 'none' }) })
    // #endif
  }
}

function onSaveServer() {
  const v = serverUrl.value.trim()
  if (!v) {
    uni.showToast({ title: '地址不能为空', icon: 'none' })
    return
  }
  saveBaseUrl(v)
  serverUrl.value = getBaseUrl()
  showServer.value = false
  uni.showToast({ title: '已保存，重新加载…', icon: 'none' })
  load()
}

function statusBadgeClass(s: string): string {
  if (s === 'ok') return 'b-ok'
  if (s === 'fail') return 'b-fail'
  return 'b-pending'
}

function statusText(s: string): string {
  return ({ ok: '正常', fail: '异常', pending: '等待' } as const)[s as 'ok' | 'fail' | 'pending'] || s || '—'
}

function valueText(item: MonitorItem): string {
  if (item.last_status !== 'ok') return item.last_status === 'fail' ? '抓取失败' : '尚未抓取'
  if (item.type === 'crypto') return item.last_value ? `$${item.last_value.toFixed(2)}` : ''
  if (item.type === 'fx') return item.last_value ? item.last_value.toFixed(4) : ''
  if (item.type === 'stock') return item.last_value ? `¥${item.last_value.toFixed(2)}` : ''
  if (item.type === 'product') return item.last_value ? `¥${item.last_value.toFixed(2)}` : ''
  return item.last_value ? `${item.last_value} 条` : ''
}

function tabTitle(t: TabKey): string {
  return ({ items: '监控项', news: '新闻', alerts: '告警' } as const)[t]
}

// 告警详情(展开显示完整信息)
const expandedAlert = ref<AlertItem | null>(null)

function toggleAlert(a: AlertItem) {
  expandedAlert.value = expandedAlert.value?.id === a.id ? null : a
}

function alertTypeLabel(t: string): string {
  return ({
    news_hit: '新闻命中',
    threshold: '阈值告警',
    price_low: '低价提醒',
    price_high: '高价提醒',
    product_change: '价格变动',
    check_fail: '抓取失败',
  } as const)[t as keyof typeof alertTypeLabel] || t
}

function onCopyAlertText(a: AlertItem) {
  uni.setClipboardData({
    data: `${a.message}\n时间: ${formatTime(a.created_at)}`,
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  })
}
</script>

<template>
  <view class="page" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <!-- 顶部 -->
    <view class="header">
      <view class="header-row">
        <view>
          <view class="title">7×24 监控</view>
          <view class="subtitle">{{ statusTitle }}</view>
        </view>
        <view class="header-actions">
          <view class="icon-btn" @tap="onRefresh">
            <text :class="['icon-text', refreshing ? 'spin' : '']">⟳</text>
          </view>
          <view class="icon-btn" @tap="onRunNow">
            <text class="icon-text">▶</text>
          </view>
          <view class="icon-btn" @tap="showServer = !showServer">
            <text class="icon-text">⚙</text>
          </view>
        </view>
      </view>
      <view v-if="showServer" class="server-box">
        <input v-model="serverUrl" class="server-input" placeholder="服务器地址，如 http://your-server:18080" />
        <view class="server-save" @tap="onSaveServer">保存</view>
      </view>
    </view>

    <!-- Tab -->
    <view class="tabs">
      <view
        v-for="t in (['items','news','alerts'] as TabKey[])"
        :key="t"
        :class="['tab', activeTab === t ? 'tab-active' : '']"
        @tap="activeTab = t"
      >
        {{ tabTitle(t) }}
      </view>
    </view>

    <!-- 内容 -->
    <view v-if="loading && items.length === 0" class="empty">加载中…</view>

    <!-- 监控项 -->
    <view v-else-if="activeTab === 'items'">
      <view v-if="items.length === 0" class="empty">
        <view class="empty-title">暂无监控项</view>
        <view class="empty-body">点击下方「添加监控」配置股票、新闻关键词或商品价格监控。</view>
      </view>
      <view v-for="it in items" :key="it.id" class="card" @tap="onEdit(it)">
        <view class="card-top">
          <view class="card-name">
            <text class="type-badge" :class="'t-' + it.type">{{ typeLabel(it.type) }}</text>
            <text class="name">{{ it.name }}</text>
          </view>
          <view class="card-right">
            <switch :checked="it.enabled" color="#17191c" style="transform: scale(0.75)" @tap.stop="onToggle(it)" @change.stop.prevent="" />
            <text class="status-dot" :class="statusBadgeClass(it.last_status)">{{ statusText(it.last_status) }}</text>
          </view>
        </view>
        <view class="card-value">{{ valueText(it) }}</view>
        <view class="card-detail">{{ it.last_detail || '尚未抓取' }}</view>
        <view class="card-meta">
          <text class="meta-text">{{ it.type === 'product' ? it.target : it.target }}</text>
          <text class="meta-text">更新 {{ formatTime(it.last_checked) }}</text>
          <text class="del" @tap.stop="onDelete(it)">删除</text>
        </view>
      </view>
      <view class="add-btn" @tap="onAdd">＋ 添加监控</view>
    </view>

    <!-- 新闻 -->
    <view v-else-if="activeTab === 'news'">
      <view v-if="news.length === 0" class="empty">暂无新闻，添加新闻关键词监控后自动采集。</view>
      <view v-for="n in filteredNews" :key="n.id" class="news-card" @tap="onOpenNews(n)">
        <view class="news-title">{{ n.title }}</view>
        <view class="news-meta">
          <text class="meta-text">{{ n.source }}</text>
          <text class="news-match">命中: {{ n.matched }}</text>
        </view>
      </view>
    </view>

    <!-- 告警 -->
    <view v-else>
      <view v-if="alerts.length === 0" class="empty">暂无告警记录。</view>
      <view v-for="a in filteredAlerts" :key="a.id" class="alert-card" @tap="toggleAlert(a)">
        <view class="news-title">{{ a.message }}</view>
        <view class="news-meta">
          <text class="meta-text">{{ a.item_name }}</text>
          <text class="meta-text">{{ formatTime(a.created_at) }}</text>
          <text class="alert-type">{{ alertTypeLabel(a.type) }}</text>
        </view>
        <view v-if="expandedAlert && expandedAlert.id === a.id" class="alert-detail">
          <view class="alert-detail-row">类型: {{ alertTypeLabel(a.type) }}</view>
          <view class="alert-detail-row">监控项: {{ a.item_name }}</view>
          <view class="alert-detail-row">时间: {{ formatTime(a.created_at) }}</view>
          <view class="alert-detail-row">内容: {{ a.message }}</view>
          <view class="alert-copy" @tap.stop="onCopyAlertText(a)">复制告警</view>
        </view>
      </view>
    </view>

    <view class="footer-space" />
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 0 16px;
  padding-top: 12px;
}
.header {
  padding: 8px 0 12px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: 22px;
  font-weight: 700;
}
.subtitle {
  font-size: 12px;
  color: #8a9099;
  margin-top: 2px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.icon-text {
  font-size: 16px;
  color: #17191c;
}
.spin {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.server-box {
  margin-top: 10px;
  background: #fff;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.server-input {
  flex: 1;
  font-size: 13px;
  padding: 6px 8px;
  background: #f5f6f8;
  border-radius: 8px;
}
.server-save {
  padding: 6px 14px;
  background: #17191c;
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
}
.tabs {
  display: flex;
  background: #fff;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 12px;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  color: #8a9099;
  border-radius: 8px;
}
.tab-active {
  background: #17191c;
  color: #fff;
  font-weight: 600;
}
.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-name {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}
.t-stock { background: #e8f0fe; color: #1a56db; }
.t-news { background: #fdf3e3; color: #b45309; }
.t-product { background: #e8f8ee; color: #0a7a3a; }
.name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.status-dot {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
}
.b-ok { background: #e6f7ec; color: #0a7a3a; }
.b-fail { background: #fdecea; color: #c0392b; }
.b-pending { background: #f0f0f0; color: #666; }
.card-value {
  font-size: 22px;
  font-weight: 700;
  margin-top: 8px;
}
.card-detail {
  font-size: 13px;
  color: #555;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.meta-text {
  font-size: 11px;
  color: #8a9099;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}
.del {
  margin-left: auto;
  font-size: 12px;
  color: #e5484d;
  padding: 2px 6px;
}
.add-btn {
  background: #17191c;
  color: #fff;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  margin-top: 14px;
}
.news-card, .alert-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.news-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}
.news-meta {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.news-match {
  font-size: 11px;
  color: #b45309;
  background: #fdf3e3;
  padding: 1px 6px;
  border-radius: 8px;
}
.alert-type {
  font-size: 11px;
  color: #1a56db;
  background: #e8f0fe;
  padding: 1px 6px;
  border-radius: 8px;
}
.alert-detail {
  margin-top: 10px;
  background: #f8f9fb;
  border-radius: 10px;
  padding: 10px 12px;
}
.alert-detail-row {
  font-size: 13px;
  color: #444;
  line-height: 1.7;
  word-break: break-all;
}
.alert-copy {
  margin-top: 8px;
  text-align: center;
  background: #17191c;
  color: #fff;
  padding: 7px;
  border-radius: 8px;
  font-size: 13px;
}
.empty {
  text-align: center;
  padding: 60px 30px;
  color: #8a9099;
  font-size: 14px;
}
.empty-title {
  font-size: 16px;
  color: #555;
  font-weight: 600;
  margin-bottom: 6px;
}
.footer-space { height: 40px; }
</style>
