import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 服务器地址: 构建时用环境变量 VITE_MONITOR_BASE 注入(源码脱敏不含真实 IP)
const monitorBase = process.env.VITE_MONITOR_BASE || 'http://127.0.0.1:18080'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // 相对路径, 便于 WebView 用 file:// 加载
  define: {
    __VITE_MONITOR_BASE__: JSON.stringify(monitorBase),
  },
  plugins: [
    uni(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
