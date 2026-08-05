# pi-gui 一键安装脚本
# 用法:
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1            # 安装最新版(显示向导)
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Silent    # 静默安装
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Version v1.0.4  # 指定版本

param(
    [switch]$Silent,
    [string]$Version = "",
    [string]$Repo = "LieGeee/pi-suite"
)

$ErrorActionPreference = "Stop"
$apiBase = "https://api.github.com/repos/$Repo"

function Get-ReleaseInfo {
    param([string]$Ref)
    if ($Ref) {
        $url = "$apiBase/releases/tags/$Ref"
    } else {
        $url = "$apiBase/releases/latest"
    }
    return Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "pi-suite-installer" }
}

function Get-InstallerUrl {
    param($Release)
    $asset = $Release.assets | Where-Object { $_.name -match "\.exe$" -and $_.name -match "x64" } | Select-Object -First 1
    if (-not $asset) {
        $asset = $Release.assets | Where-Object { $_.name -match "\.exe$" } | Select-Object -First 1
    }
    if (-not $asset) {
        throw "Release $($Release.tag_name) 中未找到 Windows 安装包 (.exe)"
    }
    return $asset
}

Write-Host "=== pi-gui 安装器 ===" -ForegroundColor Cyan
Write-Host "仓库: $Repo"

$release = Get-ReleaseInfo -Ref $Version
Write-Host "版本: $($release.tag_name)"
Write-Host "名称: $($release.name)"

$asset = Get-InstallerUrl -Release $release
Write-Host "安装包: $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)"

$installerPath = Join-Path $env:TEMP $asset.name
Write-Host "下载中: $($asset.browser_download_url)" -ForegroundColor Yellow
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath -UseBasicParsing
Write-Host "下载完成: $installerPath" -ForegroundColor Green

if ($Silent) {
    Write-Host "静默安装中..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    Write-Host "安装器退出码: $($proc.ExitCode)" -ForegroundColor Green
} else {
    Write-Host "启动安装向导..." -ForegroundColor Yellow
    Start-Process -FilePath $installerPath
}

Write-Host ""
Write-Host "=== 完成 ===" -ForegroundColor Cyan
Write-Host "安装后可运行 pi-gui 桌面版。手机版 APK 请在 Release 页面下载:" 
Write-Host "  https://github.com/$Repo/releases/latest"
