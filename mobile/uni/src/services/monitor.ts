// pi-monitor 手机端服务层: API 封装 + 本地配置存储。
// 通过 HTTP 访问部署在服务器上的 pi-monitor 服务(默认 http://47.121.197.240:18080)。

export interface MonitorItem {
  id: number
  type: 'stock' | 'news' | 'product'
  name: string
  target: string
  extra: string
  enabled: boolean
  last_status: 'ok' | 'fail' | 'pending' | ''
  last_value: number
  last_detail: string
  last_checked: string
  created_at: string
  updated_at: string
}

export interface MonitorExtra {
  // 股票
  alert_down_pct?: number
  alert_up_pct?: number
  price_low?: number
  price_high?: number
  // 商品
  min_price?: number
  max_price?: number
  price_regex?: string
  title_regex?: string
  // 新闻
  sources?: string
}

export interface MonitorSettings {
  interval_min: number
  webhook_url: string
  serverchan_key: string
  notify_enabled: boolean
}

export interface PricePoint {
  id: number
  item_id: number
  value: number
  status: string
  detail: string
  created_at: string
}

export interface NewsItem {
  id: number
  source: string
  title: string
  url: string
  content: string
  published: string
  matched: string
  created_at: string
}

export interface AlertItem {
  id: number
  item_id: number
  item_name: string
  type: string
  message: string
  created_at: string
}

// ---- 本地配置存储 ----

const STORAGE_BASE_URL = 'pi_monitor_base_url'

export function defaultBaseUrl(): string {
  return 'http://47.121.197.240:18080'
}

export function getBaseUrl(): string {
  try {
    const v = uni.getStorageSync(STORAGE_BASE_URL)
    return v || defaultBaseUrl()
  } catch {
    return defaultBaseUrl()
  }
}

export function saveBaseUrl(url: string): void {
  uni.setStorageSync(STORAGE_BASE_URL, url.replace(/\/+$/, ''))
}

// ---- 请求封装 ----

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: object): Promise<T> {
  const base = getBaseUrl()
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: base + path,
      method,
      data: body,
      timeout: 20000,
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        const status = res.statusCode || 0
        if (status >= 200 && status < 300) {
          resolve(res.data as T)
        } else {
          const data = res.data as { error?: string } | undefined
          reject(new ApiError(status, data?.error || `请求失败 (${status})`))
        }
      },
      fail: (err) => {
        reject(new ApiError(0, `网络错误: ${err.errMsg || ''}`))
      },
    })
  })
}

// ---- 监控项 ----

export function listItems(): Promise<{ items: MonitorItem[] }> {
  return request('GET', '/api/v1/items')
}

export function createItem(data: { type: MonitorItem['type']; name: string; target: string; enabled: boolean; extra?: MonitorExtra }): Promise<{ ok: boolean; item: MonitorItem }> {
  const payload: Record<string, unknown> = { ...data }
  if (data.extra) payload.extra = JSON.stringify(data.extra)
  return request('POST', '/api/v1/items', payload)
}

export function updateItem(id: number, data: { type: MonitorItem['type']; name: string; target: string; enabled: boolean; extra?: MonitorExtra | string }): Promise<{ ok: boolean }> {
  const payload: Record<string, unknown> = { ...data }
  if (typeof data.extra === 'object' && data.extra) payload.extra = JSON.stringify(data.extra)
  return request('PUT', `/api/v1/items/${id}`, payload)
}

export function deleteItem(id: number): Promise<{ ok: boolean }> {
  return request('DELETE', `/api/v1/items/${id}`)
}

export function triggerRun(): Promise<{ ok: boolean }> {
  return request('POST', '/api/v1/run')
}

export function testFetch(type: string, target: string, extra?: MonitorExtra): Promise<{ ok: boolean; detail?: string; error?: string }> {
  return request('POST', '/api/v1/test', { type, target, extra: extra ? JSON.stringify(extra) : '' })
}

export function itemHistory(id: number, limit = 50): Promise<{ points: PricePoint[] }> {
  return request('GET', `/api/v1/items/${id}/history?limit=${limit}`)
}

export function listNews(limit = 50): Promise<{ news: NewsItem[] }> {
  return request('GET', `/api/v1/news?limit=${limit}`)
}

export function listAlerts(limit = 50): Promise<{ alerts: AlertItem[] }> {
  return request('GET', `/api/v1/alerts?limit=${limit}`)
}

// ---- 设置 ----

export function getSettings(): Promise<MonitorSettings> {
  return request('GET', '/api/v1/settings')
}

export function saveSettings(settings: MonitorSettings): Promise<{ ok: boolean }> {
  return request('PUT', '/api/v1/settings', settings)
}

// ---- 工具 ----

export function parseExtra(raw: string): MonitorExtra {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as MonitorExtra
  } catch {
    return {}
  }
}

export function typeLabel(type: MonitorItem['type']): string {
  return ({ stock: '股票', news: '新闻', product: '商品' } as const)[type] || type
}

export function formatTime(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
