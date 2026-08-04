import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mobileRelayUrlToHttpBase,
  normalizeMobileRelayUrl,
  parsePairPayload,
  resolvePairConnection,
} from '../src/services/pairing'

test('normalizeMobileRelayUrl fills scheme and mobile websocket path', () => {
  assert.equal(normalizeMobileRelayUrl('localhost:8787'), 'ws://localhost:8787/ws/mobile')
  assert.equal(normalizeMobileRelayUrl('http://localhost:8787'), 'ws://localhost:8787/ws/mobile')
  assert.equal(normalizeMobileRelayUrl('ws://localhost:8787/ws/desktop'), 'ws://localhost:8787/ws/mobile')
})

test('parsePairPayload extracts relay and token from desktop QR data', () => {
  const parsed = parsePairPayload('pi-gui://pair?relay=ws%3A%2F%2Flocalhost%3A8787%2Fws%2Fmobile&token=pi_abc')
  assert.deepEqual(parsed, {
    relayUrl: 'ws://localhost:8787/ws/mobile',
    pairToken: 'pi_abc',
  })
})

test('parsePairPayload converts desktop websocket path in QR data to mobile path', () => {
  const parsed = parsePairPayload('pi-gui://pair?relay=ws%3A%2F%2Flocalhost%3A8787%2Fws%2Fdesktop&token=pi_same')
  assert.deepEqual(parsed, {
    relayUrl: 'ws://localhost:8787/ws/mobile',
    pairToken: 'pi_same',
  })
})

test('parsePairPayload treats bare pi token as token only', () => {
  assert.deepEqual(parsePairPayload('pi_token_only'), { pairToken: 'pi_token_only' })
})

test('mobileRelayUrlToHttpBase converts websocket relay URL to HTTP API base', () => {
  assert.equal(mobileRelayUrlToHttpBase('ws://localhost:8787/ws/mobile'), 'http://localhost:8787')
  assert.equal(mobileRelayUrlToHttpBase('wss://relay.example/ws/desktop'), 'https://relay.example')
})

test('resolvePairConnection returns ready connection settings from scanned desktop QR', () => {
  const result = resolvePairConnection({
    scannedValue: 'pi-gui://pair?relay=ws%3A%2F%2Flocalhost%3A8787%2Fws%2Fmobile&token=pi_scanned',
    currentRelayUrl: '',
    currentPairToken: '',
  })

  assert.deepEqual(result, {
    relayUrl: 'ws://localhost:8787/ws/mobile',
    pairToken: 'pi_scanned',
    ready: true,
  })
})
