<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { connectSavedSettings, loadSettings, store } from '@/services/relay'
import { loadAccessibilitySettings } from '@/services/accessibility'

onLaunch(() => {
  loadAccessibilitySettings()
  loadSettings()
  connectSavedSettings()
})

onShow(() => {
  if (store.connectionStatus === 'idle' && store.pairToken) {
    connectSavedSettings()
  }
})
</script>

<style>
page {
  background: #f5f6f8;
  color: #17191c;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  letter-spacing: 0;
}

view,
scroll-view,
text,
input,
textarea,
button {
  box-sizing: border-box;
}

button::after {
  border: none;
}

button {
  letter-spacing: 0;
}

.text-scale-standard {
  --font-page-title: 40rpx;
  --font-title: 29rpx;
  --font-body: 25rpx;
  --font-meta: 22rpx;
  --font-control: 27rpx;
  --app-header-height: 112rpx;
  --app-control-height: 76rpx;
  --app-list-row-height: 126rpx;
}

.text-scale-large {
  --font-page-title: 46rpx;
  --font-title: 34rpx;
  --font-body: 29rpx;
  --font-meta: 25rpx;
  --font-control: 31rpx;
  --app-header-height: 126rpx;
  --app-control-height: 88rpx;
  --app-list-row-height: 144rpx;
}

.text-scale-extra-large {
  --font-page-title: 52rpx;
  --font-title: 39rpx;
  --font-body: 34rpx;
  --font-meta: 28rpx;
  --font-control: 36rpx;
  --app-header-height: 142rpx;
  --app-control-height: 102rpx;
  --app-list-row-height: 166rpx;
}

.app-safe-top {
  padding-top: var(--status-bar-height);
}

.icon {
  width: 40rpx;
  height: 40rpx;
  display: block;
}

.icon-button {
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 16rpx;
  background: transparent;
  line-height: 1;
}

.icon-button:active {
  background: #eceef1;
}

.primary-button,
.secondary-button,
.danger-button {
  min-height: 84rpx;
  margin: 0;
  padding: 0 28rpx;
  border: none;
  border-radius: 16rpx;
  font-size: var(--font-control, 28rpx);
  font-weight: 650;
  line-height: 84rpx;
}

.primary-button {
  background: #17191c;
  color: #fff;
}

.secondary-button {
  background: #eceef1;
  color: #202328;
}

.danger-button {
  background: #feeceb;
  color: #c62d28;
}

button[disabled] {
  opacity: .38;
}
</style>
