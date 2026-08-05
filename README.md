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

## 使用文档

- **[安装与下载指南](docs/install.md)**：Release 下载、一键安装脚本、常见问题
- **[桌面版使用指南](docs/usage.md)**：斜杠命令、键盘快捷键、图片粘贴、手机版配对
- **[斜杠命令速查](docs/slash-commands.md)**：全部 `/` 命令一览
- **[手机版客户端](mobile/uni/README.md)**：uni-app 客户端说明
- **[中继服务](mobile/relay/README.md)**：桌面 ↔ 手机 relay 说明
- **[Web 客户端](mobile/client/README.md)**：Vite + React 移动端说明

> 🚀 **Release 自动构建**：打 `v*` tag 即触发 GitHub Actions 自动构建 Windows 安装包并上传 Release（见 `.github/workflows/release.yml`）。一键安装：`powershell -File scripts/install.ps1`

### 常用斜杠命令速览

输入 `/` 即可在输入框弹出命令菜单。

| 命令 | 作用 |
|------|------|
| `/model` | 为当前会话选择模型 |
| `/thinking` | 设置推理强度（低/中/高/超高） |
| `/tree` | 浏览会话分支 |
| `/status` | 显示会话状态 |
| `/session` | 显示会话详情 |
| `/name 新标题` | 重命名会话 |
| `/compact` | 压缩上下文 |
| `/reload` | 重新加载提示词/技能/资源 |
| `/login` `/logout` | 提供商登录/退出 |
| `/settings` | 打开设置 |
| `/scoped-models` | 选择已启用模型 |

> 技能还会注册 `/skill:xxx` 运行时命令，显示在斜杠菜单的「运行时命令」分区。

### 常用快捷键速览

| 快捷键 (Win) | 快捷键 (macOS) | 作用 |
|--------------|----------------|------|
| `Ctrl + ,` | `⌘ + ,` | 设置 |
| `Ctrl + J` | `⌘ + J` | 终端面板 |
| `Ctrl + B` | `⌘ + B` | 侧边栏 |
| `Ctrl + D` | `⌘ + D` | 变更 (Diff) 面板 |
| `Ctrl + Shift + O` | `⌘ + Shift + O` | 新建对话 |
| `Ctrl + F` | `⌘ + F` | 时间线搜索 |
| `Ctrl + V` | `⌘ + V` | 粘贴剪贴板图片到输入框 |

> 🖼️ **粘贴图片**：复制任意图片后，在对话输入框按 `Ctrl+V`（macOS `⌘+V`）直接粘贴为附件，支持 PNG / JPG / GIF / WebP（单图 ≤ 10MB）。

## 安全说明

提交前请确保：

- 不提交 `node_modules/`、`dist/`、`release/`、`out/`、`unpackage/` 等构建产物。
- 不提交任何 `.env`、`auth.json`、`models.json`、`settings.json`、API Key、Token。
- Pi 的本地会话记录（`agent/sessions/`）与运行数据永不提交。

## License

各子项目保留各自的 License（见 `pi-gui/LICENSE`）。
