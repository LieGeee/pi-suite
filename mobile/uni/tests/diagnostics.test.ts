import assert from 'node:assert/strict'
import test from 'node:test'
import { describePairingDiagnostics } from '../src/services/diagnostics'

test('describePairingDiagnostics reports invalid token', () => {
  const result = describePairingDiagnostics({ ok: false, error: '配对 Token 无效或已撤销。' })

  assert.equal(result.problem, 'invalid-token')
  assert.match(result.detail, /Token 无效/)
})

test('describePairingDiagnostics reports desktop offline before snapshot problems', () => {
  const result = describePairingDiagnostics({ ok: true, desktopOnline: false, mobileOnlineCount: 1, hasLatestSnapshot: false })

  assert.equal(result.problem, 'desktop-offline')
  assert.match(result.detail, /没有 Windows 端连接/)
})

test('describePairingDiagnostics reports missing desktop snapshot', () => {
  const result = describePairingDiagnostics({ ok: true, desktopOnline: true, mobileOnlineCount: 1, hasLatestSnapshot: false })

  assert.equal(result.problem, 'snapshot-missing')
  assert.match(result.detail, /desktop\.snapshot/)
})

test('describePairingDiagnostics reports relay ok when desktop and snapshot are present', () => {
  const result = describePairingDiagnostics({ ok: true, desktopOnline: true, mobileOnlineCount: 1, hasLatestSnapshot: true })

  assert.equal(result.problem, 'relay-ok')
  assert.match(result.detail, /已收到任务快照/)
})
