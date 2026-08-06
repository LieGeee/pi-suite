#!/usr/bin/env bash
#
# pi 手机端 APK 自动构建 + 部署脚本
# 1. uni-app 构建 app-android 资源 -> 同步 www 到原生 WebView 壳
# 2. gradle 打 release APK (v2 签名)
# 3. 上传服务器 + 更新 OTA 配置(手机端可远程自动更新)
#
# 用法:
#   ./scripts/build-apk.sh [版本名] [版本Code] [更新说明]
#
# 示例:
#   ./scripts/build-apk.sh 1.0.7 107 "新增历史走势图"
#
# 环境变量(不硬编码):
#   DEPLOY_HOST  服务器地址, 默认 YOUR_SERVER
#   ANDROID_HOME Android SDK 路径
#   ANDROID_AVD_HOME 模拟器 AVD 路径(可选)
set -euo pipefail

# ---- 版本参数 ----
NEW_NAME="${1:-}"
NEW_CODE="${2:-}"
NOTE="${3:-新版本更新}"

# ---- 路径 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UNI_DIR="$REPO_ROOT/mobile/uni"
SHELL_DIR="${PI_MOBILE_SHELL:-S:/code/pi-mobile-app}"
ANDROID_HOME="${ANDROID_HOME:-S:/tool/anzhuosdk}"
DEPLOY_HOST="${DEPLOY_HOST:-YOUR_SERVER}"

cd "$UNI_DIR"

# ---- 版本读取/校验 ----
if [ -z "$NEW_CODE" ]; then
    NEW_NAME=$(python -c "import json;print(json.load(open('src/manifest.json',encoding='utf-8'))['versionName'])")
    NEW_CODE=$(python -c "import json;print(json.load(open('src/manifest.json',encoding='utf-8'))['versionCode'])")
    echo "📦 使用现有版本: v$NEW_NAME ($NEW_CODE)"
fi

# 更新 manifest.json 版本
python - "$NEW_NAME" "$NEW_CODE" <<'EOF'
import json, sys
name, code = sys.argv[1], sys.argv[2]
p = 'src/manifest.json'
m = json.load(open(p, encoding='utf-8'))
m['versionName'] = name
m['versionCode'] = int(code)
json.dump(m, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'manifest -> v{name} ({code})')
EOF

echo "=== [1/4] uni-app 构建 app-android 资源 ==="
pnpm run build:app-android
echo "✅ 构建完成"

echo "=== [2/4] 同步 www 到原生 WebView 壳 ==="
rm -rf "$SHELL_DIR/app/src/main/assets/www"
mkdir -p "$SHELL_DIR/app/src/main/assets/www"
cp -r dist/build/app/. "$SHELL_DIR/app/src/main/assets/www/"
echo "✅ 同步完成 ($(find "$SHELL_DIR/app/src/main/assets/www" -type f | wc -l) 个文件)"

echo "=== [3/4] gradle 打 release APK ==="
export ANDROID_HOME
cd "$SHELL_DIR"
./gradlew :app:assembleRelease --no-daemon
APK="$SHELL_DIR/app/build/outputs/apk/release/app-release.apk"
echo "✅ APK 生成: $APK"

# 复制为带版本号的产物
OUT_APK="$REPO_ROOT/release/pi-gui-mobile-v$NEW_CODE.apk"
mkdir -p "$REPO_ROOT/release"
cp "$APK" "$OUT_APK"
echo "✅ 产物: $OUT_APK ($(du -h "$OUT_APK" | cut -f1))"

# ---- 部署(可选) ----
if [ "$DEPLOY_HOST" != "YOUR_SERVER" ]; then
    echo "=== [4/4] 上传服务器 + 更新 OTA ==="
    REMOTE_FILE="pi-gui-mobile-v$NEW_CODE.apk"
    scp "$OUT_APK" "root@$DEPLOY_HOST:/www/server/nginx/html/$REMOTE_FILE"
    ssh "root@$DEPLOY_HOST" "cat > /www/server/nginx/html/pi-monitor-ota.json <<EOF
{\"version_code\":$NEW_CODE,\"version_name\":\"$NEW_NAME\",\"url\":\"http://$DEPLOY_HOST/$REMOTE_FILE\",\"note\":\"$NOTE\",\"mandatory\":false}
EOF"
    echo "✅ 部署完成, 手机端将自动检测到 v$NEW_NAME"
else
    echo "⚠️  未部署: 设置 DEPLOY_HOST=服务器IP 可自动上传+更新OTA"
fi

echo "🎉 完成: v$NEW_NAME ($NEW_CODE)"
