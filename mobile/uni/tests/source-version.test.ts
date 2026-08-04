import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('source manifest and settings page are bumped to v1.0.4 diagnostics build', () => {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8')) as { versionName?: string; versionCode?: string }
  const settings = readFileSync('src/pages/settings/index.vue', 'utf8')

  assert.equal(manifest.versionName, '1.0.4')
  assert.equal(manifest.versionCode, '104')
  assert.match(settings, /v1\.0\.4/)
  assert.match(settings, /诊断同步/)
})
