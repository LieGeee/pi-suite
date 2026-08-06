#!/usr/bin/env bash
#
# pi-monitor 自动部署脚本
# 本地交叉编译 Linux 二进制 -> scp 上传服务器 -> systemd 重启
#
# 用法:
#   ./scripts/deploy-monitor.sh [版本说明]
#
# 环境变量(不硬编码敏感信息, 部署时注入):
#   DEPLOY_HOST  服务器地址, 默认 YOUR_SERVER
#   DEPLOY_USER  SSH 用户, 默认 root
#   MONITOR_PORT 服务端口, 默认 18080
#
# 示例:
#   DEPLOY_HOST=47.x.x.x ./scripts/deploy-monitor.sh "修复登录"
#
set -euo pipefail

# ---- 配置(环境变量注入) ----
DEPLOY_HOST="${DEPLOY_HOST:-YOUR_SERVER}"
DEPLOY_USER="${DEPLOY_USER:-root}"
MONITOR_PORT="${MONITOR_PORT:-18080}"
REMOTE_BIN="/opt/pi-monitor/pi-monitor"
REMOTE_NEW="/opt/pi-monitor/pi-monitor.new"
REMOTE_SERVICE="pi-monitor"

# 仓库根目录(本脚本位于 scripts/, 回退到 server/pi-monitor)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONITOR_DIR="$REPO_ROOT/server/pi-monitor"

cd "$MONITOR_DIR"

# 若未指定真实服务器则中止, 提示配置
if [ "$DEPLOY_HOST" = "YOUR_SERVER" ]; then
    echo "❌ 未指定服务器地址. 请设置环境变量 DEPLOY_HOST, 例如:"
    echo "   DEPLOY_HOST=你的服务器IP $0"
    exit 1
fi

TARGET="$DEPLOY_USER@$DEPLOY_HOST"

echo "=== [1/4] 交叉编译 Linux amd64 ==="
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
    go build -ldflags "-s -w" -o "$MONITOR_DIR/bin/pi-monitor-linux" ./cmd/pi-monitor
echo "✅ 编译完成: bin/pi-monitor-linux"

echo "=== [2/4] 上传到 $DEPLOY_HOST ==="
scp "$MONITOR_DIR/bin/pi-monitor-linux" "$TARGET:$REMOTE_NEW"
echo "✅ 上传完成"

echo "=== [3/4] 备份旧版本 + 替换 ==="
ssh "$TARGET" "
    cp -f $REMOTE_BIN $REMOTE_BIN.bak 2>/dev/null || true
    mv -f $REMOTE_NEW $REMOTE_BIN
    chmod +x $REMOTE_BIN
    echo '  已备份旧版本到 pi-monitor.bak'
"

echo "=== [4/4] 重启服务 + 健康检查 ==="
ssh "$TARGET" "systemctl restart $REMOTE_SERVICE"
sleep 3
STATUS=$(ssh "$TARGET" "systemctl is-active $REMOTE_SERVICE")
echo "服务状态: $STATUS"

# 健康检查
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://$DEPLOY_HOST:$MONITOR_PORT/healthz" || true)
if [ "$STATUS" = "active" ] && [ "$HTTP" = "200" ]; then
    echo "✅ 部署成功! 服务 $MONITOR_PORT 健康检查通过"
else
    echo "⚠️  部署完成但健康检查异常 (systemd=$STATUS, http=$HTTP)"
    echo "   查看日志: ssh $TARGET 'journalctl -u $REMOTE_SERVICE -n 50 --no-pager'"
    exit 1
fi
