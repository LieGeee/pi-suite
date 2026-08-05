<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getSettings, saveSettings, type MonitorSettings } from '@/services/monitor'

const interval = ref('15')
const webhookUrl = ref('')
const serverchanKey = ref('')
const notifyEnabled = ref(false)
const loading = ref(false)
const saving = ref(false)

onShow(load)

function load() {
  loading.value = true
  getSettings()
    .then((s: MonitorSettings) => {
      interval.value = String(s.interval_min || 15)
      webhookUrl.value = s.webhook_url || ''
      serverchanKey.value = s.serverchan_key || ''
      notifyEnabled.value = !!s.notify_enabled
    })
    .catch((e) => uni.showToast({ title: (e as Error).message, icon: 'none' }))
    .finally(() => { loading.value = false })
}

function onSave() {
  const n = Number(interval.value)
  if (!n || n < 1 || n > 1440) {
    uni.showToast({ title: '间隔需为 1-1440 分钟', icon: 'none' })
    return
  }
  saving.value = true
  saveSettings({
    interval_min: n,
    webhook_url: webhookUrl.value.trim(),
    serverchan_key: serverchanKey.value.trim(),
    notify_enabled: notifyEnabled.value,
  })
    .then(() => uni.showToast({ title: '已保存', icon: 'success' }))
    .catch((e) => uni.showToast({ title: (e as Error).message, icon: 'none' }))
    .finally(() => { saving.value = false })
}

function goBack() {
  uni.navigateBack()
}

function onNotifyChange() {
  notifyEnabled.value = !notifyEnabled.value
}

function onCopyServerChan() {
  uni.setClipboardData({
    data: 'https://sct.ftqq.com/ 注册后获取 SendKey',
    success: () => uni.showToast({ title: '教程已复制', icon: 'none' }),
  })
}
</script>

<template>
  <view class="page">
    <view class="nav">
      <view class="nav-back" @tap="goBack">‹</view>
      <view class="nav-title">推送与频率设置</view>
      <view class="nav-space" />
    </view>

    <view class="card">
      <view class="section-title">抓取频率</view>
      <view class="field">
        <view class="label">间隔(分钟)</view>
        <input v-model="interval" class="input" type="number" placeholder="15" />
      </view>
      <view class="hint">每间隔多少分钟抓取一次全部监控项，默认 15 分钟。</view>
    </view>

    <view class="card">
      <view class="section-title">推送开关</view>
      <view class="field switch-field">
        <view class="label">启用推送</view>
        <switch :checked="notifyEnabled" color="#17191c" @change="onNotifyChange" />
      </view>
      <view class="hint">开启后，命中新闻/股票涨跌/降价等告警会推送到下方渠道。</view>
    </view>

    <view class="card">
      <view class="section-title">Server酱(微信推送)</view>
      <view class="field">
        <view class="label">SendKey</view>
        <input v-model="serverchanKey" class="input" placeholder="sctp... 或 sct... (留空=不启用)" />
      </view>
      <view class="hint" @tap="onCopyServerChan">在 sct.ftqq.com 用 GitHub 登录后复制 SendKey，即可在微信收到推送。</view>
    </view>

    <view class="card">
      <view class="section-title">通用 Webhook</view>
      <view class="field">
        <view class="label">回调地址</view>
        <input v-model="webhookUrl" class="input" placeholder="https://... (POST JSON)" />
      </view>
      <view class="hint">告警时会 POST {title, text} JSON 到此地址，可用于钉钉/企业微信/自建服务。</view>
    </view>

    <view class="actions">
      <view class="btn btn-primary" @tap="onSave">{{ saving ? '保存中…' : '保存设置' }}</view>
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
.actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.btn {
  flex: 1;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
}
.btn-primary {
  background: #17191c;
  color: #fff;
}
.footer-space { height: 40px; }
</style>
