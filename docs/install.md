# 安装与下载指南

本仓库通过 GitHub Releases 发布安装包。本文说明如何下载、安装 pi-gui 桌面版与手机版。

## Release 下载地址

最新版本: https://github.com/LieGeee/pi-suite/releases/latest

每个 Release 包含：

| 资产 | 说明 | 安装对象 |
|------|------|----------|
| `pi-gui-<版本>-x64.exe` | pi-gui 桌面版 Windows 安装程序（NSIS） | Windows 电脑 |
| `pi-gui-mobile-v1.0.4.apk` | pi-gui 手机版 Android 安装包 | Android 手机 |

> Release 资产会随每次打 tag（`git tag v1.x.x && git push --tags`）自动重建 Windows 安装包并上传。
> 手机版 APK 需要 HBuilderX 云打包（DCloud 账号），在 Release 中手动补充上传。

---

## 一、桌面版安装（Windows）

### 方式 A：手动下载安装（推荐）

1. 打开 https://github.com/LieGeee/pi-suite/releases/latest
2. 下载 `pi-gui-<版本>-x64.exe`
3. 双击运行，按向导安装（可自定义安装目录）

### 方式 B：一键脚本安装

```powershell
# PowerShell 执行（以管理员运行可选）
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

脚本会自动：
- 下载最新 Release 的 Windows 安装包
- 运行安装程序
- 校验下载文件的完整性

---

## 二、手机版安装（Android）

1. 下载 `pi-gui-mobile-v1.0.4.apk`
2. 传输到 Android 手机（或直接用手机浏览器打开 Release 页面下载）
3. 点击 APK 安装（需允许"安装未知来源应用"）

### 手机版配置

安装后打开 App → 设置：

| 项 | 说明 |
|----|------|
| 服务器地址 | relay 地址，如 `ws://<电脑IP>:8787/ws/mobile` |
| Token | 桌面端 pi-gui 设置 → 手机同步 中生成/扫码配对 |

> 手机与电脑需在同一网络，且 relay 服务已启动（见 `mobile/relay/README.md`）。

---

## 三、常见问题

### Q1: Release 里没有安装包？
打 tag 后 GitHub Actions 会自动构建（约 5–10 分钟），稍等刷新页面。
若构建失败，查看仓库 Actions 页面的 `Release Build` 工作流日志。

### Q2: 手机版 APK 哪里来？
APK 通过 HBuilderX 云打包生成（源码在 `mobile/uni`），手动上传到 Release。
也可以使用 `mobile/android` 的 Capacitor 工程本地构建。

### Q3: 如何触发自动构建？
```bash
git tag v1.0.5
git push origin v1.0.5
```
推送 tag 即触发 `Release Build`，自动产出 Windows 安装包并挂到 Release。

### Q4: 需要一次装齐桌面版 + 手机版？
- 电脑装 `pi-gui-<版本>-x64.exe`
- 手机装 `pi-gui-mobile-v1.0.4.apk`
- 两者通过 relay 配对即可协同（见上）
