Pi 模型配置：删除自定义 provider 后同步清理 `S:/tool/pi/agent/settings.json` 的 `defaultProvider`、`defaultModel`、`enabledModels` 残留并恢复可用默认线路。模型能力和上下文以 OpenRouter/官方资料为准，不盲信 pi 内置定义；用 `--list-models` 和真实 payload 验证 `thinking`，缺 `reasoning:true`/`thinkingLevelMap` 可能只是假性不支持。已知 Claude Sonnet 5、Fable 5、Sonnet 4.5 Thinking 为 1M 上下文。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] 统一任务/计划工作台在桌面端需要为主面板设置可读的最小列宽；三列布局在 1440px 视口也可能把中文标题挤成一字一行。应优先保证主内容可读，空间不足时纵向堆叠。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Pi subagent extension regression: `stdoutLines` was declared inside the child-process Promise executor but referenced for post-exit diagnostics outside it, causing `stdoutLines is not defined` after a child had actually completed and written files. Keep JSONL decoder state in `runSingleAgentAttempt` scope; cover this with a lifecycle test and a real child smoke before trusting subagent result status. — Failed: In xl-ht session, a DynamicForm write child produced files successfully but its parent tool returned the scope error, creating a false failure signal. <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] Vue2 + Element UI 表格两个真实坑（商务委托子委托树已踩并修复）：（1）用 v-if="data.length" 延迟挂载 el-table 会先创建行组件后列才注册，导致空 <tr>（高度 0），应始终挂载表格并用 empty-text 展示空态；（2）树表 slot 直接引用模块常量（如 STATUS_META[row.status]）运行时抛错且只剩空行，Vue2 模板只能访问组件实例，应改为组件方法/计算属性解析状态元数据。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] Pi `subagent` is an awaited tool call: after a single subagent dispatch, the parent agent cannot issue its own tool calls until that tool returns. Do not claim that the parent/main thread is continuing independently unless there is separate main-thread tool-call evidence or independent calls were emitted together in the same assistant response. The xl-ht session on 2026-08-04 confirmed a claimed main-thread parallel continuation had no parent tool calls during the child wait. <!-- created=2026-08-04, last=2026-08-04 -->
§
[correction] Subagent extension regression: `stdoutLines` JSONL decoder was declared inside the child-process Promise executor but referenced after the await for diagnostics, causing completed children to be reported as `stdoutLines is not defined`. Keep decoder state in `runSingleAgentAttempt` scope; regression test is `index-lifecycle.test.ts`. Live smoke subsequently returned exitCode 0 on `luna` with no stdoutLines error. <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] 通过 Git Bash 内联调用 PowerShell 时，`$_` 会被错误展开为 `/usr/bin/bash`，导致进程统计、目录遍历和格式化表达式失败；涉及 PowerShell 的复杂命令应写入 `.ps1` 脚本文件后执行。 — Failed: 多次排查 pi-gui 和 Node 进程时出现 PowerShell 解析错误。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[convention] 清理 pi-gui 构建目录时不能仅按目录大小判断是否可删：`apps/desktop/electron` 即使显示接近 0 GB 也可能包含受 Git 管理的源码，`apps/desktop/node_modules` 也可能是构建所需依赖。清理前必须检查 Git 状态和源码目录，删除后必须运行 typecheck/build。 — Failed: 一次磁盘清理误删了 electron 源码和 desktop node_modules，后来通过 git restore 和 pnpm install 恢复。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Windows Git Bash 中 `2>NUL` 会在仓库根目录创建空文件 `NUL`，该文件名是 Windows 保留设备名，`git add` 会报 fatal 错误。解决：删除即可，用 `2>/dev/null` 代替。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Element UI 的 el-table 在 Vue 2 + `v-if` 延迟挂载时，列数组先注册再填充数据，行组件不会重新 render，导致空 `<tr>`。根因：`v-if="projectedEntrustmentTree.length"` 在数据异步到位前不挂载表。修复：去掉 `v-if`，始终挂载表（空态用 empty-text），或改为 `v-show`。合同页不触发此问题因为它一直挂载空表。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Windows/Git Bash 下运行 PowerShell 内联命令时，`$_`、`$PID` 等变量经常被 Bash 预先展开，导致 PowerShell 语法错误；涉及进程、磁盘或路径诊断时应优先用 write 创建 `.ps1` 脚本再执行。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[correction] 核验社交媒体/新闻图片时，先明确承认真实发生的影响（如企业家被羁押导致企业倒闭、家庭受损），再指出帖子的不精确处或法律赔偿口径限制；不要用法律术语的谨慎表述让用户觉得"影响不是真的"。 — Failed: 核验"王飞夫妇被羁押致企业倒闭"新闻图片时，用户反问"你在说什么 这个不是真的影响吗?" <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Git Bash 里用 Windows 风格 `2>NUL` 重定向会真的生成名为 NUL 的空文件（偶尔 `nul`），git 无法跟踪，提交前删除即可；超长 apply_patch 在 Windows Git Bash 常因 here-doc 截断报 'Invalid patch: The last line ... / must be *** End Patch'，少量内容用小型补丁，新文件或大改动改用 write 整文件。 — Failed: Windows Git Bash 重定向与 apply_patch here-doc 截断 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] Date-boundary tests for “today” must create timestamps explicitly inside the current calendar day (for example, today start + 1h). Using `time.Now().Add(-2*time.Hour)` is flaky between midnight and 02:00 because records fall on the previous day; this caused `TestStatsGetOverviewReturnsUserScopedStats` to report zero today pomodoros/tasks. — Failed: Relative test timestamps crossed midnight, so calendar-day assertions became time-of-day dependent. <!-- created=2026-08-04, last=2026-08-04 -->
§
[failure] 检查 Go 数据源脚本时曾在工具输出中暴露明文数据库密码。后续读取配置必须对密码、令牌等凭据做脱敏，不在回复、日志摘要或持久记忆中回显；仅说明变量名和配置入口。 — Failed: 仓库脚本可能含本地联调凭据，直接展示文件内容会泄露秘密。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] dpsk-flash-worker 子代理不可靠：deepseek-v4-flash 首轮工具调用后可留下部分代码，但后续工具结果续轮固定报 "The `reasoning_content` in the thinking mode must be passed back to the API"（thinking: off/high 均无效），无法完成多步开发。同会话 terra/luna（随时qh provider，gpt-5.6-terra/luna）返回 404 模型不可用。因此定期任务批量分配等强耦合实现最终由主会话直接完成；S:/tool/pi/agent/agents/dpsk-flash-worker.md 已创建但仅适合单轮任务。 — Failed: dpsk flash 模型续轮要求回传 reasoning_content 而子代理桥未实现；随时qh 的 terra/luna 上游模型组不可用 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] HBuilderX 标准基座内嵌测试 APK 必须把 assets/data/dcloud_control.xml 的 syncDebug 设为 false，否则运行中的 HBuilderX 会把其它项目的热运行资源同步进同一包（曾出现养老助手登录后跳到 pi-mobile 页面，内嵌 app-service.js 哈希与实际页面不符）。验证新 APK 须先卸载 io.dcloud.HBuilder 再安装（install -r 可能继续加载旧 www）。 — Failed: syncDebug=true 时 HBuilderX 将另一项目资源热同步进同包名基座 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] 本机 PostgreSQL 17（S:\tool\PostgreSQL\17）是 bin-only 安装，initdb 因缺少 $libdir/dict_snowball 失败；本机 docker postgres:16-alpine 又报 exec format error（镜像与内核 ABI 不匹配）。因此一次性数据库/迁移验证不要在本机起 PostgreSQL 或 Docker，直接对云端预发布库执行（DSN 从项目配置读取，不回显凭据，先备份再迁移）。 — Failed: 本地 PG17 缺扩展库文件、Docker 镜像 exec format error，本地一次性库无法建立 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] Android App-PLUS 登录页密码输入框光标与掩码圆点重合/贴边：原生 input[type=password] 用默认 sans-serif 时，最后一个掩码圆点与光标共用边缘像素。修复：仅密码框加 .password-input { font-family: monospace; letter-spacing: 0; }，账号框保持正常字体；此前"假文字层+透明 input"双叠层方案是错误根因。验证可用 WebView CDP（adb forward + webview_devtools_remote 端口）读取 uni-input 计算样式与真实 value 长度，截图需排除系统权限弹窗拦截。 — Failed: 密码掩码字形水平度量导致光标贴字；曾误用双叠层方案未解决 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] [tool-quirk] RuoYi 运维：登录时把角色/权限缓存 Redis，插入菜单+角色授权后旧 token 仍无新权限，须重新登录获取新 token。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] xl-ht 商务委托动作平台（2026-08-04）：AUTO/WORK_ORDER_CREATE 动作在插入 `biz_entrustment_execution_action` 之前就准备 payload，此时 `action.id` 尚未生成；commandId 必须用事务前已稳定的键（tenantId+entrustmentId+triggerStatus+actionType）拼接，否则所有真实动作在事务内直接失败。事件回写须防乱序：`biz_entrustment_execution_ref` 增加 command_id/attempt_version 并按最新创建尝试校验；事件 inbox 幂等用普通 INSERT + 捕获 DuplicateKeyException，本项目禁止 INSERT IGNORE/REPLACE 掩盖漂移。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Pi cli_execute（S:/tool/pi 自定义 CLI 扩展）在 Windows 上把整段 command 当单个参数传给 mysql.exe：带空格的 `-e ...`、`SOURCE file` 都会失败（如 `SOURCE/**/file` 不被识别）。可行做法：写临时 Node runner——解析 Nacos 快照 `[NACOS_CONFIG_PATH_REDACTED] 的 datasource 块（URL/用户名/密码在第 32-38 行附近，第 7 行是 Redis 密码别取错），用 spawn 传参并设 `MYSQL_PWD` 环境变量，再以 `--default-character-set=utf8mb4` 执行，否则中文表/列注释乱码；预检一律走 information_schema。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[correction] xl-ht fefde468 不能仅凭 subagent 与全绿测试认定修复完成。主代理独立复查发现：客户自助端仍不渲染/发送 serviceLines；工作台后端仍只返回硬编码 order/capabilities；AUTO scheduler 默认启用且准备失败会反复扫描；事件契约缺 occurredAt/sourceNo 校验和状态白名单。今后必须核对真实调用链与负向场景。 — Failed: 过早采信子代理完成结论，测试覆盖的是降级/字符串契约而非完整业务闭环。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] 提交/备份 /s/tool/pi 相关仓库前必须先扫描排除凭据文件：agent/auth.json（及其 .bak 备份）、agent/models.json、agent/settings.json 含 token/Key；agent/extensions/dify-client*.mjs 等扩展文件也含 API 密钥，严禁提交。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] 用户全局 git config：autocrlf=input、sslVerify=false（HTTPS 不校验证书）、http.proxy 为空；另有 gitee 与 gitea.xinlian-starlinetech.com 的 credential provider 配置。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[failure] Tauri 桌面悬浮窗三连根因：① mousedown 直接调 startDragging 会吞掉 click，面板永远打不开——需 pointer 状态机（位移>2px 才启动 native drag，原地抬起即展开）；② 登录成功后窗口仍保持登录大窗而内容已是悬浮圈——认证态窗口模式必须统一编排（未登录→登录窗，已登录→缩为悬浮圈），不能依赖子组件 emit 时序；③ 150% DPI 下 PhysicalSize(76,76) 客户区仅 50×50 裁掉悬浮圈——窗口模式必须用 LogicalSize，位置持久化仍用物理坐标。对应回归测试：WindowGestureTracker、auth-window-state、Rust window_modes_use_logical_css_pixel_sizes。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[failure] 番茄时间桌面双击闪退：开始菜单快捷方式指向的 G:\tools\番茄时间悬浮窗\tomato-time-desktop.exe 仍是旧构建（plugins.autostart 配置 panic，退出码 101），此前验证通过的只是构建目录 EXE。NSIS 打包会向 EXE 写入安装元数据，安装版哈希与 release 不同属正常；遇闪退必须先比较安装目录 EXE 的 mtime/hash、用最新 dist 安装包覆盖安装，并从快捷方式真实目标启动验证，不能只看构建产物。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[tool-quirk] Pi 本环境无 code-reviewer 子代理，可用 dpsk-flash-worker/dpsk-reviewer/dpsk-scout；subagent 扩展报「stdoutLines is not defined」时与模型无关、重试无效，应直接由主会话完成审查。Edge 无头 CDP 截图时 fallback_task_provider.cc:126 日志是 Chromium 内部诊断可忽略，真正要看 Runtime.exceptionThrown 与 HTTP 4xx/5xx。 <!-- created=2026-08-04, last=2026-08-04 -->
§
[insight] Tauri 运行时疑难排查：编译/单测全绿但用户反馈异常时，在 Rust 加 debug_log 命令写固定日志文件（如 S:/tool/pi/tmp/tomato-debug.log）并在 JS 端同步打点，重启复现后读日志确认真实调用链。曾用此法定位 keyring v3 缺 windows-native feature 导致 token 重启丢失、以及 refresh/create 的真实成功/失败结果，而非仅靠 UI 外观推断。 <!-- created=2026-08-04, last=2026-08-04 -->