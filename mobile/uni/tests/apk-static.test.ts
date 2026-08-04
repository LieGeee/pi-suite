import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const apkPath = 'S:/tool/pi-gui-mobile.apk'
const inspectDir = 'S:/tool/pi/apks/inspect-current-test'

function readText(relativePath: string): string {
  return readFileSync(join(inspectDir, relativePath), 'utf8')
}

test('current Android APK contains native barcode module and v1.0.3 app assets', () => {
  assert.equal(existsSync(apkPath), true, `${apkPath} does not exist`)
  rmSync(inspectDir, { recursive: true, force: true })
  mkdirSync(inspectDir, { recursive: true })
  execFileSync('unzip', ['-oq', apkPath, '-d', inspectDir])

  const dcloudProperties = readText('assets/data/dcloud_properties.xml')
  const manifest = readText('assets/apps/__UNI__0213B1B/www/manifest.json')
  const routes = readText('assets/apps/__UNI__0213B1B/www/app-config-service.js')
  const appService = readText('assets/apps/__UNI__0213B1B/www/app-service.js')

  assert.match(dcloudProperties, /feature name="Barcode"/)
  assert.match(manifest, /"code":"103"/)
  assert.match(manifest, /"name":"1\.0\.3"/)
  assert.match(routes, /pages\/notifications\/index/)
  assert.match(appService, /手机生成 Token/)
  assert.match(appService, /扫码失败/)
})
