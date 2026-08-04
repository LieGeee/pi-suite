export interface ParsedPairPayload {
  readonly relayUrl?: string
  readonly pairToken?: string
}

export const DEFAULT_MOBILE_RELAY_URL = 'ws://localhost:8787/ws/mobile'

export function normalizeMobileRelayUrl(value: string): string {
  let url = value.trim()
  if (!url) return DEFAULT_MOBILE_RELAY_URL

  if (!/^wss?:\/\//.test(url) && !/^https?:\/\//.test(url)) {
    url = `ws://${url}`
  }

  url = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  url = url.replace('/ws/desktop', '/ws/mobile')

  if (!url.endsWith('/ws/mobile')) {
    url = url.replace(/\/$/, '') + '/ws/mobile'
  }

  return url
}

export function mobileRelayUrlToHttpBase(value: string): string {
  return normalizeMobileRelayUrl(value)
    .replace(/\/ws\/(mobile|desktop)$/, '')
    .replace(/^ws:/, 'http:')
    .replace(/^wss:/, 'https:')
}

export function resolvePairConnection(input: {
  readonly scannedValue: string
  readonly currentRelayUrl: string
  readonly currentPairToken: string
}): { readonly relayUrl: string; readonly pairToken: string; readonly ready: boolean } {
  const parsed = parsePairPayload(input.scannedValue)
  const relayUrl = normalizeMobileRelayUrl(parsed.relayUrl ?? input.currentRelayUrl)
  const pairToken = (parsed.pairToken ?? input.currentPairToken).trim()
  return { relayUrl, pairToken, ready: Boolean(relayUrl && pairToken) }
}

export function parsePairPayload(result: string): ParsedPairPayload {
  const value = result.trim()
  if (!value) return {}

  if (value.startsWith('pi-gui://pair?')) {
    const params = new URLSearchParams(value.replace('pi-gui://pair?', ''))
    const relay = params.get('relay') || ''
    const token = params.get('token') || ''
    return {
      ...(relay ? { relayUrl: normalizeMobileRelayUrl(relay) } : {}),
      ...(token ? { pairToken: token } : {}),
    }
  }

  if (
    value.startsWith('ws://') ||
    value.startsWith('wss://') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    /^[\w.-]+:\d+/.test(value)
  ) {
    return { relayUrl: normalizeMobileRelayUrl(value) }
  }

  return { pairToken: value }
}
