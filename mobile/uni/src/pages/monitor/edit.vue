<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  createItem,
  getBaseUrl,
  listItems,
  parseExtra,
  testFetch,
  type MonitorExtra,
  type MonitorItem,
  updateItem,
} from '@/services/monitor'

const editId = ref<number | null>(null)
const type = ref<'stock' | 'news' | 'product' | 'crypto' | 'fx'>('stock')
const name = ref('')
const target = ref('')
const enabled = ref(true)

// stock
const alertDownPct = ref('')
const alertUpPct = ref('')
const priceLow = ref('')
const priceHigh = ref('')
// product
const minPrice = ref('')
const maxPrice = ref('')
const priceRegex = ref('')
const titleRegex = ref('')
// news
const sources = ref('')
// crypto/fx
const alertBelow = ref('')
const alertAbove = ref('')

const saving = ref(false)
const testing = ref(false)
const testResult = ref('')
const testOk = ref(false)

const typeOptions: { key: 'stock' | 'news' | 'product' | 'crypto' | 'fx'; label: string; hint: string; placeholder: string }[] = [
  { key: 'stock', label: '股票', hint: '支持 A股/港股/美股/指数，可设涨跌幅与价格阈值告警', placeholder: 'sh600519 / hk00700 / usAAPL / sh000001' },
  { key: 'news', label: '新闻', hint: '按关键词监控多个新闻源，命中即收录并推送', placeholder: '如 人工智能,AI,大模型(逗号分隔)' },
  { key: 'product', label: '商品', hint: '监控商品价格 API / 官网 JSON-LD / 自定正则', placeholder: '价格 API 或商品页 URL' },
  { key: 'crypto', label: '加密币', hint: 'Gate.io 行情，如 BTC/ETH，可设价格阈值告警', placeholder: '如 BTC_USDT / ETH_USDT' },
  { key: 'fx', label: '汇率', hint: '新浪外汇汇率，可设阈值告警', placeholder: '如 susdcny(美元/人民币) / eurusd' },
]

onLoad((query) => {
  const id = query?.id ? Number(query.id) : null
  if (id) {
    editId.value = id
    loadItem(id)
  }
})

function loadItem(id: number) {
  listItems()
    .then(({ items }) => {
      const it = items.find((i) => i.id === id)
      if (!it) return
      fillForm(it)
    })
    .catch((e) => uni.showToast({ title: (e as Error).message, icon: 'none' }))
}

function fillForm(it: MonitorItem) {
  type.value = it.type
  name.value = it.name
  target.value = it.target
  enabled.value = it.enabled
  const extra = parseExtra(it.extra)
  alertDownPct.value = extra.alert_down_pct ? String(extra.alert_down_pct) : ''
  alertUpPct.value = extra.alert_up_pct ? String(extra.alert_up_pct) : ''
  priceLow.value = extra.price_low ? String(extra.price_low) : ''
  priceHigh.value = extra.price_high ? String(extra.price_high) : ''
  minPrice.value = extra.min_price ? String(extra.min_price) : ''
  maxPrice.value = extra.max_price ? String(extra.max_price) : ''
  priceRegex.value = extra.price_regex || ''
  titleRegex.value = extra.title_regex || ''
  sources.value = extra.sources || ''
  alertBelow.value = extra.alert_below ? String(extra.alert_below) : ''
  alertAbove.value = extra.alert_above ? String(extra.alert_above) : ''
}

function buildExtra(): MonitorExtra {
  const extra: MonitorExtra = {}
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v))
  if (type.value === 'stock') {
    const d = num(alertDownPct.value)
    const u = num(alertUpPct.value)
    const l = num(priceLow.value)
    const h = num(priceHigh.value)
    if (d > 0) extra.alert_down_pct = d
    if (u > 0) extra.alert_up_pct = u
    if (l > 0) extra.price_low = l
    if (h > 0) extra.price_high = h
  }
  if (type.value === 'product') {
    const mn = num(minPrice.value)
    const mx = num(maxPrice.value)
    if (mn > 0) extra.min_price = mn
    if (mx > 0) extra.max_price = mx
    if (priceRegex.value.trim()) extra.price_regex = priceRegex.value.trim()
    if (titleRegex.value.trim()) extra.title_regex = titleRegex.value.trim()
  }
  if (type.value === 'news' && sources.value.trim()) {
    extra.sources = sources.value.trim()
  }
  if (type.value === 'crypto' || type.value === 'fx') {
    const below = num(alertBelow.value)
    const above = num(alertAbove.value)
    if (below > 0) extra.alert_below = below
    if (above > 0) extra.alert_above = above
  }
  return extra
}

function validate(): string {
  if (!name.value.trim()) return '请填写名称'
  if (!target.value.trim()) return '请填写目标(代码/关键词/链接)'
  return ''
}

function onTest() {
  const err = validate()
  if (err) {
    uni.showToast({ title: err, icon: 'none' })
    return
  }
  testing.value = true
  testResult.value = ''
  testOk.value = false
  testFetch(type.value, target.value.trim(), buildExtra())
    .then((res) => {
      testOk.value = !!res.ok
      testResult.value = res.ok ? (res.detail || '测试成功') : (res.error || '测试失败')
    })
    .catch((e) => {
      testOk.value = false
      testResult.value = (e as Error).message
    })
    .finally(() => { testing.value = false })
}

function onSave() {
  const err = validate()
  if (err) {
    uni.showToast({ title: err, icon: 'none' })
    return
  }
  saving.value = true
  const payload = {
    type: type.value,
    name: name.value.trim(),
    target: target.value.trim(),
    enabled: enabled.value,
    extra: buildExtra(),
  }
  const op = editId.value ? updateItem(editId.value, payload) : createItem(payload)
  op.then(() => {
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  })
    .catch((e) => {
      uni.showToast({ title: (e as Error).message, icon: 'none' })
    })
    .finally(() => { saving.value = false })
}

function placeholderFor(): string {
  const found = typeOptions.find((o) => o.key === type.value)
  return found?.placeholder || ''
}

function hintFor(): string {
  const found = typeOptions.find((o) => o.key === type.value)
  return found?.hint || ''
}

function goBack() {
  uni.navigateBack()
}

function onTypeChange() {
  // switch 状态已由 uni 组件维护, 这里直接用当前值取反
  enabled.value = !enabled.value
}

function onTestStockExample() {
  if (type.value === 'stock' && !target.value.trim()) {
    target.value = 'sh600519'
    name.value = name.value.trim() || '贵州茅台'
  }
}
</script>

<template>
  <view class="page">
    <view class="nav">
      <view class="nav-back" @tap="goBack">‹</view>
      <view class="nav-title">{{ editId ? '编辑监控' : '添加监控' }}</view>
      <view class="nav-space" />
    </view>

    <!-- 类型选择 -->
    <view class="card">
      <view class="section-title">类型</view>
      <view class="type-grid">
        <view
          v-for="o in typeOptions"
          :key="o.key"
          :class="['type-item', type === o.key ? 'type-item-active' : '']"
          @tap="type = o.key"
        >
          {{ o.label }}
        </view>
      </view>
      <view class="hint">{{ hintFor() }}</view>
    </view>

    <!-- 基础 -->
    <view class="card">
      <view class="section-title">基础信息</view>
      <view class="field">
        <view class="label">名称</view>
        <input v-model="name" class="input" placeholder="如 贵州茅台 / AI动态 / 键盘降价" />
      </view>
      <view class="field">
        <view class="label">{{ type === 'product' ? '商品链接' : type === 'stock' ? '股票代码' : '关键词' }}</view>
        <input
          v-model="target"
          class="input"
          :placeholder="placeholderFor()"
          @blur="onTestStockExample"
        />
      </view>
      <view class="field switch-field">
        <view class="label">启用</view>
        <switch :checked="enabled" color="#17191c" @change="onTypeChange" />
      </view>
    </view>

    <!-- 股票阈值 -->
    <view v-if="type === 'stock'" class="card">
      <view class="section-title">告警阈值(可选)</view>
      <view class="field">
        <view class="label">单日跌幅 ≥ %</view>
        <input v-model="alertDownPct" class="input" type="number" placeholder="如 3" />
      </view>
      <view class="field">
        <view class="label">单日涨幅 ≥ %</view>
        <input v-model="alertUpPct" class="input" type="number" placeholder="如 5" />
      </view>
      <view class="field">
        <view class="label">价格低于</view>
        <input v-model="priceLow" class="input" type="digit" placeholder="如 1200" />
      </view>
      <view class="field">
        <view class="label">价格高于</view>
        <input v-model="priceHigh" class="input" type="digit" placeholder="如 1500" />
      </view>
    </view>

    <!-- 商品设置 -->
    <view v-if="type === 'product'" class="card">
      <view class="section-title">价格提醒(可选)</view>
      <view class="field">
        <view class="label">降价到 ≤</view>
        <input v-model="minPrice" class="input" type="digit" placeholder="如 999" />
      </view>
      <view class="field">
        <view class="label">涨到 ≥</view>
        <input v-model="maxPrice" class="input" type="digit" placeholder="如 1999" />
      </view>
      <view class="field">
        <view class="label">价格正则(高级)</view>
        <input v-model="priceRegex" class="input" placeholder="默认自动识别" />
      </view>
      <view class="field">
        <view class="label">标题正则(高级)</view>
        <input v-model="titleRegex" class="input" placeholder="默认自动识别" />
      </view>
      <view class="hint">提示: 部分平台(淘宝/闲鱼)需要登录，可能无法直接抓到价格，可先点「测试抓取」验证。</view>
    </view>

    <!-- 加密货币/汇率阈值 -->
    <view v-if="type === 'crypto' || type === 'fx'" class="card">
      <view class="section-title">阈值告警(可选)</view>
      <view class="field">
        <view class="label">低于</view>
        <input v-model="alertBelow" class="input" type="digit" placeholder="如 50000" />
      </view>
      <view class="field">
        <view class="label">高于</view>
        <input v-model="alertAbove" class="input" type="digit" placeholder="如 70000" />
      </view>
      <view class="hint">{{ type === 'crypto' ? '加密货币价格阈值(BTC_USDT 单位 USDT)' : '汇率阈值(如美元兑人民币 6.5-7.0)' }}</view>
    </view>

    <!-- 新闻源 -->
    <view v-if="type === 'news'" class="card">
      <view class="section-title">新闻源(可选)</view>
      <view class="field">
        <view class="label">指定来源</view>
        <input v-model="sources" class="input" placeholder="如 36氪,IT之家(留空=全部)" />
      </view>
      <view class="hint">可用来源: 36氪 / IT之家 / cnBeta / 少数派 / 爱范儿 / 搜狐科技 / 雪球 / 华尔街见闻</view>
    </view>

    <!-- 测试 + 保存 -->
    <view class="test-box" v-if="testResult">
      <view :class="['test-result', testOk ? 'test-ok' : 'test-fail']">{{ testResult }}</view>
    </view>
    <view class="actions">
      <view class="btn btn-ghost" @tap="onTest">{{ testing ? '测试中…' : '测试抓取' }}</view>
      <view class="btn btn-primary" @tap="onSave">{{ saving ? '保存中…' : '保存' }}</view>
    </view>

    <view class="footer-space" />
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 0 16px;
  padding-top: calc(var(--status-bar-height, 0px) + 8px);
}
.nav {
  display: flex;
  align-items: center;
  padding: 10px 0 14px;
}
.nav-back {
  font-size: 28px;
  line-height: 1;
  padding: 4px 8px 4px 0;
  color: #17191c;
}
.nav-title {
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 600;
}
.nav-space { width: 32px; }
.card {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 13px;
  color: #8a9099;
  margin-bottom: 10px;
  font-weight: 600;
}
.type-grid {
  display: flex;
  gap: 8px;
}
.type-item {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  background: #f5f6f8;
  font-size: 14px;
  color: #555;
}
.type-item-active {
  background: #17191c;
  color: #fff;
  font-weight: 600;
}
.field {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f5f6f8;
}
.field:last-child { border-bottom: none; }
.label {
  width: 110px;
  font-size: 14px;
  color: #333;
  flex-shrink: 0;
}
.input {
  flex: 1;
  font-size: 14px;
  padding: 8px 10px;
  background: #f5f6f8;
  border-radius: 8px;
}
.switch-field { justify-content: space-between; }
.hint {
  font-size: 12px;
  color: #8a9099;
  margin-top: 10px;
  line-height: 1.6;
}
.test-box {
  margin-bottom: 12px;
}
.test-result {
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.test-ok { background: #e6f7ec; color: #0a7a3a; }
.test-fail { background: #fdecea; color: #c0392b; }
.actions {
  display: flex;
  gap: 10px;
}
.btn {
  flex: 1;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
}
.btn-ghost {
  background: #fff;
  color: #17191c;
  border: 1px solid #ddd;
}
.btn-primary {
  background: #17191c;
  color: #fff;
}
.footer-space { height: 40px; }
</style>
