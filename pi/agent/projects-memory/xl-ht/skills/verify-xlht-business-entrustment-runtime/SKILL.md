---
name: "verify-xlht-business-entrustment-runtime"
description: "Use when validating xl-ht business entrustment roles, status transitions, contract-linked root/child trees, browser routes, or cleanup against the running local services and live ft_base database."
version: 3
created: "2026-07-28"
updated: "2026-08-02"
---
## When to Use
Use after changing the business entrustment backend, real API adapter, role scopes, status rules, parent/root hierarchy, contract reverse lookup, or detail/contract tree UI. This is for controlled local runtime verification against ports 2999/8880/8882 and ft_base, not for unit-only checks.

## Procedure
13. For formal-document snapshot coverage (C 版编辑器 + A4 打印), require the incremental migration `hh/sql/update_business_entrustment_document.sql` to be applied to the live `ft_base` first: assert `document_title/sign_date/payment_method/terms_text` columns, both `biz_entrustment_party_profile` and `biz_entrustment_party_snapshot` tables, their unique keys, and the tenant-9 `PARTY_B` seed (`珠海港环通供应链有限公司` / `珠海市金湾区高栏港环港西路2481号`, NULL contact name/phone). Then create a disposable ordinary draft with a unique `PI-ENTRUSTMENT-DOC-E2E-*` marker through the real API and assert: party A equals the linked customer-order snapshot (`CUSTOMER_ORDER`), party B equals the tenant profile (`TENANT_PROFILE`), client-supplied `partyA/partyB` objects are overwritten, `documentTitle/signDate/paymentMethod/termsText` persist, the A4 `document.vue` preview only reads `getWorkEntrustment` snapshots and exposes no cost/margin/internal remark, and DB snapshot rows match the API detail. Clean up instance + both snapshot rows + service lines by exact IDs and audit the marker prefix to zero.
## Pitfalls
- Direct `/auth/login` through port 8880 can disagree transiently with the actual 2999 proxy path; validate through `/dev-api` before diagnosing credentials.
- The visible default Edge and CDP 9334 use different user-data directories. A login in one does not authenticate the other.
- The Nacos YAML contains an earlier Redis password. Pair datasource credentials by indentation/block proximity or a YAML parser.
- Temporary status transitions make records non-draft, so API delete cannot fully clean them. Secure database cleanup before creating them.
- A collapsed Element UI tree still has hidden child `<tr>` elements. Raw DOM row count is not visible row count.
- Vue 2 templates cannot read module-level constants directly through slot render context. Expose metadata through a component method/computed property and inspect runtime exceptions if rows render as empty `<tr>`.
- In Git Bash on Windows, `2>nul` creates an untracked `nul` file. Use `2>/dev/null`.
- All tokens, SQL helpers, screenshots, and result logs belong under `S:/tool/pi/tmp`, never in Git.

## Verification
1. Java command exits successfully with all `BusinessEntrustment*Test` and `DriverGateEntryActionHandlerTest` tests passing.
2. Frontend `test:business-work-entrustment`, `test:business-entrustment-backend`, target ESLint, and `build:prod` succeed; distinguish existing build warnings from new failures.
3. Runtime output proves BUSINESS transitions, OPERATION transitions, terminal-parent rejection, child inheritance/rollup, and contract reverse lookup.
4. Browser output has zero critical HTTP/console/runtime failures, no page overflow, two visible rows after expanding each tree, correct bidirectional navigation, and no customer/contract finance leakage.
5. Database queries show zero remaining `PI-E2E-*` orders, instances, lines, links, history, actions, and refs.
6. `git diff --check` passes and only intended files are staged or committed.