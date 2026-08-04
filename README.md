# Pi Suite

Pi coding agent 全家桶：Pi 配置/技能/扩展 + pi-gui 桌面版源码 + 手机版（uni-app 客户端、Web 客户端、中继服务、Android APK）。

> **公开仓库声明**：本仓库不含任何 API 密钥、Token、会话记录或本地数据。所有密钥均通过环境变量或本地配置注入，请勿提交任何敏感文件。

## 目录结构

```text
pi-suite/
├─ pi/                       # Pi coding agent 配置与扩展
│  └─ agent/
│     ├─ skills/             # 可复用技能
│     ├─ extensions/         # 自定义扩展（subagent、dify、codegraph 等）
│     ├─ prompts/            # 系统提示词
│     ├─ agents/             # 子代理定义
│     ├─ pi-hermes-memory/   # 长期记忆（MEMORY.md / failures.md / skills）
│     ├─ projects-memory/    # 项目级记忆
│     └─ config/             # 配置（不含密钥）
│
├─ pi-gui/                   # pi-gui 桌面版完整源码（含 git 历史）
│  ├─ apps/
│  │  ├─ desktop/            # Electron 桌面应用
│  │  └─ website/            # 网站
│  └─ packages/
│     └─ pi-sdk-driver/      # SDK 驱动
│
└─ mobile/                   # 手机版
   ├─ uni/                   # uni-app 客户端（H5/App 多端）
   ├─ client/                # Vite + React 移动 Web 客户端
   ├─ relay/                 # 桌面↔手机中继服务（WebSocket）
   └─ android/               # Capacitor Android 工程源码
```

## 架构

```text
pi-gui desktop  <--WebSocket-->  pi-mobile-relay  <--WebSocket/HTTPS-->  mobile client (uni / React)
```

- **pi-gui desktop**：Electron 桌面客户端，管理 Pi 会话、技能、扩展、模型。
- **pi-mobile-relay**：独立中继服务，转发桌面与移动端配对消息，不执行本地任务、不存储模型密钥或 Pi 认证文件。
- **pi-mobile-uni / pi-mobile-client**：移动端 UI，展示任务快照、获取会话记录、发送授权指令。

## 快速开始

### pi-gui 桌面版

```bash
cd pi-gui
pnpm install
pnpm --filter @pi-gui/desktop typecheck
cd apps/desktop
pnpm run build
pnpm exec electron-builder --win --dir --publish never
```

### mobile relay

```bash
cd mobile/relay
pnpm install
pnpm test
pnpm run build
pnpm start   # 默认 127.0.0.1:8787
```

### mobile uni 客户端

```bash
cd mobile/uni
pnpm install
pnpm dev:h5        # H5 开发
pnpm build:app-android   # Android App 构建
```

## 安全说明

提交前请确保：

- 不提交 `node_modules/`、`dist/`、`release/`、`out/`、`unpackage/` 等构建产物。
- 不提交任何 `.env`、`auth.json`、`models.json`、`settings.json`、API Key、Token。
- Pi 的本地会话记录（`agent/sessions/`）与运行数据永不提交。

## License

各子项目保留各自的 License（见 `pi-gui/LICENSE`）。
