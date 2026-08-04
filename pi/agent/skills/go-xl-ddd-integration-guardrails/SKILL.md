---
name: go-xl-ddd-integration-guardrails
description: Use when discussing or implementing go-xl, xl--gt, approval, task, scheduling, OpenAPI/API center, workflow/process orchestration, or cross-system integration changes.
version: 1
created: 2026-05-22
updated: 2026-05-22
---
# go-xl DDD Integration Guardrails

## When to Use
Use for any go-xl/xl--gt integration, approval, task, scheduling, skill matching, OpenAPI/API center, workflow/process orchestration, or cross-system development request.

## Core Boundary
- `xl--gt` owns logistics/business facts: orders, forwarding, stock, transport, finance, business statuses.
- `go-xl OpenAPI/dev-api-service` is the anti-corruption/integration layer: external auth, field mapping, tenant access, callbacks, runtime results, execution logs.
- `process/workflow` layer owns cross-domain process state and orchestration: process instances, nodes, events, waits, branches, retries, compensation.
- `approval-service` owns approval capability only: templates, instances, nodes, actions, logs.
- `task-service` owns task/dispatch capability only: todos, tasks, scheduling, skill/position matching.

## Guardrail Check
Before accepting a design, check if it makes an outer business system directly chain internal capabilities:

Bad smell:
```text
xl--gt button/service -> approval-service
xl--gt button/service -> task-service
xl--gt button/service -> scheduling/rule service
```

Preferred:
```text
xl--gt command/event
  -> go-xl OpenAPI / Integration ACL
  -> process/workflow application service
  -> approval/task/dispatch as internal capabilities
  -> integration callback/event to xl--gt
```

## Mandatory Reminder
If a request would scatter workflow logic across xl--gt buttons, Java services, go-xl gateway proxies, approval actions, and task updates, explicitly warn the user:

> 这有违反 DDD 边界的风险：流程编排会散在业务按钮/接口里。建议把它收敛为「xl--gt 发命令/事件 -> go-xl OpenAPI 防腐层 -> process/workflow 编排 -> approval/task 能力调用」。

## Design Rules
- Expose stable capability APIs, not internal CRUD or internal gRPC metadata.
- External systems should use `external_ref`, `process_ref`, `approval_ref`, `idempotency_key`, `event_id`; do not depend on internal table fields or reserved task fields.
- Do not expose `ap_instance_node`, internal `node_id`, `reserved_string_field_*`, or gRPC headers as platform contracts.
- Use events for progress: `CustomerPaid`, `FinanceConfirmedReceipt`, `DangerousGoodsApproved`, `TransportAssigned`, `OperationCompleted`.
- Use commands for intent: `StartDomesticExportProcess`, `SubmitApproval`, `CompleteTask`, `SignalProcessEvent`.
- Keep state ownership clear: process state in process/workflow, approval state in approval, task state in task, business record status in xl--gt.

## Applying to go-xl API Platform
The existing API platform is useful for integration but is not itself the workflow engine. Use it for:
- tenantCode/auth_code validation
- field mapping
- OpenAPI runtime access
- outbound dispatch/callbacks
- runtime fields such as `runtime.task_id`, `runtime.instance_id`, future `runtime.process_instance_id`
- execution logs

For long cross-department flows, add or use a process/workflow layer behind the API platform instead of directly exposing separate approval/task calls.

## Quick Decision Table
| Request pattern | Response |
| --- | --- |
| “xl--gt click calls approval, then task, then callback” | Warn and propose process/workflow orchestration |
| “Expose go-xl approval/task ability to xl--gt” | Use OpenAPI/Integration ACL + stable platform DTOs |
| “Long flow like order -> payment -> finance -> hazard review -> transport -> operation” | Model as process instance with approval/task/event nodes |
| “Need temporary single approval integration” | Allow as short-term adapter, but label as tactical and avoid leaking internal IDs |

## Verification Questions
Ask these before implementation:
1. Who owns the business fact?
2. Who owns the process state?
3. Is this a command, event, approval, task, or business status update?
4. Are we exposing a stable platform contract or leaking internal service/table details?
5. Can retry/idempotency/callback failure be handled without distributed transactions?