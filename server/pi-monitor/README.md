# pi-monitor 7x24 监控服务

部署在 `YOUR_SERVER:18080` 的常驻监控服务，自动抓取股票行情、新闻关键词、商品价格，支持阈值告警推送（Server酱 / Webhook）。

## 功能

| 类型 | 说明 | 配置示例 |
|------|------|----------|
| `stock` | A股行情监控(腾讯接口) | `sh600519` / `sz002594` / `bj830799` |
| `news` | 多源新闻关键词采集(8个源) | `人工智能,AI,大模型` |
| `product` | 商品价格监控(HTML/JSON/JSON-LD) | 商品页 URL 或价格 API |

- 定时抓取(默认 15 分钟，可在设置改)，启动即抓一轮
- 告警：股票涨跌幅阈值/价格区间、新闻命中、商品降价/涨价
- 推送：Server酱(微信)、通用 Webhook(POST JSON `{title,text}`)
- 网页仪表盘 `http://YOUR_SERVER:18080/`
- 手机端：pi-suite mobile uni-app 新增「监控」tab 可管理全部配置

## API

```
GET  /healthz
GET  /api/v1/items                 # 监控项列表
POST /api/v1/items                 # 新增 {type,name,target,extra,enabled}
PUT  /api/v1/items/:id             # 更新
DELETE /api/v1/items/:id           # 删除
GET  /api/v1/items/:id/history     # 价格历史
GET  /api/v1/news                  # 采集的新闻
GET  /api/v1/alerts                # 告警记录
GET  /api/v1/settings              # 全局设置(间隔/推送)
PUT  /api/v1/settings              # 保存设置
POST /api/v1/run                   # 手动触发一轮抓取
POST /api/v1/test                  # 测试抓取(不落库) {type,target,extra}
```

### 商品监控的 extra 字段

```json
{ "min_price": 999, "max_price": 1999, "price_regex": "(\\\\d+)\\s*元", "title_regex": "" }
```

- 优先识别 JSON API 响应(`price`/`data.price` 等常见路径)
- 其次 JSON-LD(`schema.org Product`)
- 最后通用正则；抓不到可自定义 `price_regex`
- 注意：淘宝/京东/拼多多/闲鱼主站需登录+反爬，直抓受限，可改用第三方价格 API 或监控公开 JSON-LD 的商品官网

## 部署(已在 YOUR_SERVER 完成)

```bash
# 服务端 systemd
scp bin/pi-monitor-linux root@YOUR_SERVER:/opt/pi-monitor/pi-monitor
ssh root@YOUR_SERVER
systemctl enable --now pi-monitor   # 开机自启 + 自动重启
curl http://127.0.0.1:18080/healthz
```

- 数据存 `/opt/pi-monitor/data/monitor.db`(SQLite, 纯 Go 无 CGO)
- 日志 `journalctl -u pi-monitor -f`

## 开发

```bash
go build ./... && go test ./...
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o bin/pi-monitor-linux ./cmd/pi-monitor
```
