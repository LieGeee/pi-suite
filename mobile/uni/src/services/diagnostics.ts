export interface RelayPairDiagnostics {
  readonly ok: boolean
  readonly error?: string
  readonly desktopOnline?: boolean
  readonly mobileOnlineCount?: number
  readonly hasLatestSnapshot?: boolean
  readonly recentNotificationCount?: number
  readonly lastEnvelopeTypes?: readonly string[]
}

export type PairingProblem = 'invalid-token' | 'desktop-offline' | 'snapshot-missing' | 'relay-ok'

export interface PairingDiagnosis {
  readonly problem: PairingProblem
  readonly title: string
  readonly detail: string
}

export function describePairingDiagnostics(diagnostics: RelayPairDiagnostics): PairingDiagnosis {
  if (!diagnostics.ok) {
    return {
      problem: 'invalid-token',
      title: 'Token 无效',
      detail: diagnostics.error || '服务器无法找到这个配对 Token，请重新从 Windows 端生成二维码。',
    }
  }

  if (!diagnostics.desktopOnline) {
    return {
      problem: 'desktop-offline',
      title: 'Windows 端未在线',
      detail: '手机已连接 relay，但这个 Token 下没有 Windows 端连接。请确认 Windows 使用同一个 Token 并启用移动端同步。',
    }
  }

  if (!diagnostics.hasLatestSnapshot) {
    return {
      problem: 'snapshot-missing',
      title: '还没收到任务列表',
      detail: 'Windows 端已在线，但还没有向 relay 发送 desktop.snapshot。请确认桌面端是最新版本并已打开移动端同步。',
    }
  }

  return {
    problem: 'relay-ok',
    title: '同步链路正常',
    detail: `Windows 在线，手机在线数 ${diagnostics.mobileOnlineCount ?? 0}，已收到任务快照。`,
  }
}
