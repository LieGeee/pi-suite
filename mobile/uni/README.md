# pi-mobile-uni

pi-gui 手机版客户端（uni-app 多端应用），支持 H5 / Android App 等平台。

## 功能

- **对话列表**：查看桌面端任务/对话，按状态筛选（全部 / 最近 / 未读 / 失败）
- **通知**：接收桌面端通知推送
- **设置**：relay 服务器地址与配对 Token 管理、扫码配对、连接状态查看

## 架构

```text
pi-gui desktop <--WebSocket--> pi-mobile-relay <--WebSocket/HTTPS--> pi-mobile-uni
```

手机端通过 relay 与桌面端配对，**不存储模型密钥或 Pi 认证文件**，所有操作经配对 Token 授权后转发到桌面端执行。

## 开发

```bash
pnpm install
pnpm dev:h5               # H5 开发模式
pnpm dev:custom           # 自定义平台开发
pnpm build:h5             # 构建 H5
pnpm build:app-android    # 构建 Android App 资源
pnpm typecheck            # Vue/TS 类型检查
pnpm test:unit            # 单元测试
```

## 环境

- **relay 默认地址**：`ws://localhost:8787/ws/mobile`（可在设置页修改为实际 relay 地址）
- 配对流程：Windows 端 pi-gui 设置 → 手机同步 → 生成 Token → 手机端填写服务器地址 + Token

## 目录

```text
src/
├─ pages/
│  ├─ tasks/          # 对话/任务列表
│  ├─ notifications/  # 通知
│  ├─ conversation/   # 会话详情
│  └─ settings/       # 设置与配对
├─ services/
│  ├─ relay.ts        # relay 连接与状态管理
│  └─ pairing.ts      # 配对解析（二维码/Token）
└─ static/            # 静态资源
```

## 测试

```bash
pnpm test:unit
```

> 注意：`tests/*.xml` 是 UIAutomator 界面快照 fixture（已脱敏），非真实运行时数据。
