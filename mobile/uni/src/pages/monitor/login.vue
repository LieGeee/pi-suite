<script setup lang="ts">
import { ref } from 'vue'
import { login, register, saveBaseUrl, setToken, setUser, getBaseUrl, defaultBaseUrl } from '@/services/monitor'

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirm = ref('')
const nickname = ref('')
const baseUrl = ref(getBaseUrl())
const loading = ref(false)
const errorMsg = ref('')

function switchMode(m: 'login' | 'register') {
  mode.value = m
  errorMsg.value = ''
}

function onLogin() {
  const name = username.value.trim()
  const pw = password.value
  if (!name || !pw) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  saveBaseUrl(baseUrl.value.trim() || defaultBaseUrl())
  login(name, pw)
    .then((res) => {
      setToken(res.token)
      setUser(res.user)
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        uni.switchTab({ url: '/pages/monitor/index' })
      }, 500)
    })
    .catch((e) => {
      errorMsg.value = (e as Error).message
    })
    .finally(() => { loading.value = false })
}

function onRegister() {
  const name = username.value.trim()
  const pw = password.value
  if (!name || !pw) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (pw.length < 6) {
    errorMsg.value = '密码至少 6 位'
    return
  }
  if (pw !== confirm.value) {
    errorMsg.value = '两次密码不一致'
    return
  }
  loading.value = true
  errorMsg.value = ''
  saveBaseUrl(baseUrl.value.trim() || defaultBaseUrl())
  register(name, pw, nickname.value.trim())
    .then((res) => {
      setToken(res.token)
      setUser(res.user)
      uni.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        uni.switchTab({ url: '/pages/monitor/index' })
      }, 500)
    })
    .catch((e) => {
      errorMsg.value = (e as Error).message
    })
    .finally(() => { loading.value = false })
}

function onQuickDemo() {
  username.value = 'admin'
  password.value = 'admin123'
  onLogin()
}
</script>

<template>
  <view class="page">
    <view class="hero">
      <view class="hero-icon">📡</view>
      <view class="hero-title">pi 监控</view>
      <view class="hero-sub">股票 · 新闻 · 加密币 · 汇率 7×24 监控</view>
    </view>

    <view class="card">
      <view class="tabs">
        <view :class="['tab', mode === 'login' ? 'tab-active' : '']" @tap="switchMode('login')">登录</view>
        <view :class="['tab', mode === 'register' ? 'tab-active' : '']" @tap="switchMode('register')">注册</view>
      </view>

      <view class="field">
        <view class="label">用户名</view>
        <input v-model="username" class="input" placeholder="请输入用户名" />
      </view>
      <view class="field">
        <view class="label">密码</view>
        <input v-model="password" class="input" password placeholder="请输入密码" />
      </view>
      <view v-if="mode === 'register'" class="field">
        <view class="label">确认密码</view>
        <input v-model="confirm" class="input" password placeholder="再次输入密码" />
      </view>
      <view v-if="mode === 'register'" class="field">
        <view class="label">昵称(可选)</view>
        <input v-model="nickname" class="input" placeholder="昵称" />
      </view>

      <view class="field">
        <view class="label">服务器地址</view>
        <input v-model="baseUrl" class="input" placeholder="http://your-server:18080" />
      </view>

      <view v-if="errorMsg" class="error">{{ errorMsg }}</view>

      <view class="btn btn-primary" @tap="mode === 'login' ? onLogin() : onRegister()">
        {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册' }}
      </view>
      <view v-if="mode === 'login'" class="btn btn-ghost" @tap="onQuickDemo">演示账号快速登录 (admin/admin123)</view>
    </view>

    <view class="footer">登录后自动同步监控数据，无需扫码配对</view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 0 24px;
  padding-top: calc(var(--status-bar-height, 0px) + 48px);
}
.hero {
  text-align: center;
  padding: 32px 0 28px;
}
.hero-icon {
  font-size: 52px;
}
.hero-title {
  font-size: 26px;
  font-weight: 700;
  margin-top: 10px;
  color: #17191c;
}
.hero-sub {
  font-size: 13px;
  color: #8a9099;
  margin-top: 6px;
}
.card {
  background: #fff;
  border-radius: 16px;
  padding: 20px 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.tabs {
  display: flex;
  background: #f5f6f8;
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 16px;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 9px 0;
  font-size: 15px;
  color: #8a9099;
  border-radius: 8px;
}
.tab-active {
  background: #17191c;
  color: #fff;
  font-weight: 600;
}
.field {
  display: flex;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid #f5f6f8;
}
.field:last-child { border-bottom: none; }
.label {
  width: 78px;
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
.error {
  color: #e5484d;
  font-size: 13px;
  margin: 10px 0 4px;
  text-align: center;
}
.btn {
  text-align: center;
  padding: 13px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  margin-top: 14px;
}
.btn-primary {
  background: #17191c;
  color: #fff;
}
.btn-ghost {
  background: #fff;
  color: #17191c;
  border: 1px solid #ddd;
}
.footer {
  text-align: center;
  color: #8a9099;
  font-size: 12px;
  margin-top: 20px;
}
</style>
