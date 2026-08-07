import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// gradle WebView 壳 APK (S:/code/pi-mobile-app 构建), 结构为 assets/www/
const apkPath = 'S:/tool/pi-gui-mobile-v106.apk'
const inspectDir = 'S:/tool/pi/apks/inspect-current-test'

function readText(relativePath: string): string {
  return readFileSync(join(inspectDir, relativePath), 'utf8')
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>
}

test('current Android APK is gradle WebView shell with v1.0.6 app assets', () => {
  assert.equal(existsSync(apkPath), true, `${apkPath} does not exist`)
  rmSync(inspectDir, { recursive: true, force: true })
  mkdirSync(inspectDir, { recursive: true })
  execFileSync('unzip', ['-oq', apkPath, '-d', inspectDir])

  // 原生壳: MainActivity 存在, WebView 加载 assets/www/index.html
  const manifestXml = readText('AndroidManifest.xml')
  const manifest = readJson('assets/www/manifest.json')
  const routes = readText('assets/www/app-config-service.js')
  const appService = readText('assets/www/app-service.js')

  // 原生 WebView 壳加载 www 资源
  assert.match(routes, /pages\/monitor\/login/)
  assert.match(appService, /defaultBaseUrl/)
  // 版本
  const version = manifest.version as { name?: string; code?: number }
  assert.equal(version.code, 106)
  assert.equal(version.name, '1.0.6')
})
