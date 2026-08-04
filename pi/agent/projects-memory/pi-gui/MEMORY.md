xl-ht: Local full workflow/approval integration startup scripts should default `APPROVAL_AUTH_CLIENT_ENABLED=true` so department approval nodes like `安环确认` can validate approver accounts through auth-service. Use `false` only for isolated/offline smoke tests; otherwise it causes `审批账号校验服务不可用` because approval-service has nil authClient. <!-- created=2026-06-26, last=2026-06-26 -->
§
In xl-ht go-services, `scripts/run-backend-poc-local.bat` defaults `APPROVAL_AUTH_CLIENT_ENABLED=true` and aborts if an external Go auth-service is not already listening on `127.0.0.1:9081`. The repo does not contain an auth-service startup script; only sync tools target the external auth service. <!-- created=2026-06-29, last=2026-06-29 -->
§
The original Go project at `S:/code/go/diaodu/go-xl` contains the full runtime `backend/services/auth-service` (not just protobuf contract). It listens on gRPC port 9081 from `configs/auth.yaml`, starts via `backend/start-all.bat`, uses PostgreSQL database `goxl`, and registers Auth/User/Role/Dict/Menu/Tenant/Organization/Position/JobType/WorkType/ShortLink/WeChat/Desktop binding gRPC services. <!-- created=2026-06-29, last=2026-06-29 -->
§
xl-ht Go auth sync/approval chain: full department approval needs Go auth-service on 127.0.0.1:9081 plus HT->Go auth mappings/users. `hh-system` writes `sys_go_auth_sync_task`; `sync-xlht-to-auth` consumes it and maintains `sys_org_dept_mapping` (dept/org) and `sys_go_auth_mapping` (user/role/post). `S:/code/xl-ht-worktrees/dock` uses XLHT_TENANT_ID=86 defaults; the main `S:/code/xl-ht` sync run.bat currently still has XLHT_TENANT_ID=9, so set tenant env explicitly before sync. <!-- created=2026-07-02, last=2026-07-02 -->
§
For xl-ht Go auth-service source migration, do not sanitize auth-service config into unusable local placeholders that require manual AUTH_DB_* setup. Preserve/commit usable local auth-service configuration directly in go-services/auth-service/configs/auth.yaml so developers can run run-backend-poc-local.bat without extra auth DB configuration. <!-- created=2026-07-02, last=2026-07-02 -->
§
xl-ht / hh-ft-ui: .eslintignore ignores broad patterns including *.js and *.vue, so targeted ESLint checks on source files need `npx eslint --no-ignore <files>` to actually lint them. <!-- created=2026-07-03, last=2026-07-03 -->
§
xl-ht Obsidian notes root (`S:\note\xl-ht`) now has hub docs: `00-总览.md` (root navigation), `90-AI速查-代码与文档结构.md` (full AI/code+docs quick context), and `91-代码入口索引.md` (module/problem-to-code entry index). Use these first for future xl-ht context recovery. <!-- created=2026-07-03, last=2026-07-03 -->
§
养老项目架构约定：需要支持租户；地理空间管理和人员组织管理要分开。`org-service` 只表示人员组织架构（部门、岗位、班组、上下级、人员归属），楼栋/楼层/房间/床位应放到独立地理/空间服务；人员档案需要关联组织架构。 <!-- created=2026-07-07, last=2026-07-07 -->
§
养老项目技术方向：用户倾向后端改用 Go/Gin + gRPC，而不是 Java/Spring；后续规划 RAG、语音识别、AI 意图识别。角色/权限期望支持租户自定义配置。 <!-- created=2026-07-07, last=2026-07-07 -->
§
xl-ht hh-ft-ui workflow approval detail can use approval-service GetInstanceDetail fields nodes/logs/flow_nodes/flow_edges; frontend previously only rendered nodes as a simple table. workflow-service REST currently registers approval templates/submit/pending/processed/my/cc/all/detail/action/current-user-org/update-form-data but not withdraw/transfer/add-cc/urge routes, despite hh-ft-ui api file having placeholder functions. <!-- created=2026-07-07, last=2026-07-07 -->
§
tomato_time: `middleware.ValidateUsername` must use Go regexp-compatible Unicode classes (currently `^[A-Za-z0-9_\p{Han}]+$`); Go regexp does not support JavaScript-style `\u4e00-\u9fa5` escapes and `regexp.MustCompile` will panic. <!-- created=2026-07-07, last=2026-07-07 -->
§
tomato_time microservice migration convention: split by functional modules (not strict DDD), keep shared MySQL initially, no API Gateway, services expose HTTP for Web/mini and gRPC for service-to-service. tag-service owns tags/word cloud/tag governance/card pools/cards/draw/recommend; community-service owns organization and prompt marketplace; misc-service owns settings/category/persona/reminder/distraction/habit; admin-service should not own business tables and should delegate governance to owner services. <!-- created=2026-07-07, last=2026-07-07 -->
§
外部申请-安环来访审批租户分层：HT 表单/部门/业务回调用 XLHT tenant_id=9；Go workflow/approval/template/list 查询用 Go/Auth tenant_id=86。hh-workflow 先用 HT tenant+dept 查 sys_org_dept_mapping，再把 goTenantId 用作 workflow x-tenant-id，并把 xlTenantId 留在 attributes 供 Go 回调写回 HT。 <!-- created=2026-07-07, last=2026-07-07 -->
§
go-services/scripts/go-xl-pg.local.bat is a tracked local PostgreSQL runtime config despite comments saying it is ignored; avoid printing its contents or committing real/local credential changes. Prefer converting it to a template or moving real config to an untracked local file. <!-- created=2026-07-08, last=2026-07-08 -->
§
xl-ht 仓储建模约定：库位和虚拟库位不是 N:1 父子关系；两者是相似/同级的位置概念。虚拟库位语义更接近临时库位/临时占位，而不是库位下的托盘位子格子。 <!-- created=2026-07-09, last=2026-07-09 -->