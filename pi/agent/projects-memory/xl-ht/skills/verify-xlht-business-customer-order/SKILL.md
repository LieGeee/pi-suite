---
name: "verify-xlht-business-customer-order"
description: "Use after changing xl-ht customer orders, client/business Web pages, customer stock-history scope, ORDER_ROOT creation, legacy protections, migrations, or hh-az-boss order UI."
version: 10
created: "2026-07-29"
updated: "2026-07-30"
---
## When to Use
Use after modifying sys_base_wt customer-order fields or state rules, BusinessCustomerOrder controllers/services/mappers, customer getInfo scope, ClientDashboard customer isolation, customer/business Web pages or menu SQL, ORDER_ROOT confirmation behavior, old SysBaseWt protections, SQL migrations, or hh-az-boss customer-order API/UI. Treat static tests, browser visuals, migrated-database checks, and deployed runtime checks as separate evidence gates.

## Procedure
1. Confirm the active branch/worktree and preserve unrelated dirty files, especially the existing docs/superpowers deletions in the main workspace.
2. From hh, run: mvn -pl hh-modules/hh-system -am -Dtest='BusinessCustomerOrder*Test,BusinessEntrustment*Test,DriverGateEntryActionHandlerTest,SysBaseWtNewOrderProtection*Test,SysBaseCustomServiceImplTest,SysUserControllerClientGetInfoTest' -Dsurefire.failIfNoSpecifiedTests=false test.
3. From hh, run the focused hh-stock customer tests: mvn -pl hh-modules/hh-stock -am -Dtest='ClientDashboardMapperRecentOrdersTest,ClientDashboardServiceImplTest' -Dsurefire.failIfNoSpecifiedTests=false test.
4. From hh-ft-ui, run test:business-customer-order-web, test:business-customer-order, test:business-entrustment-backend, and test:business-work-entrustment.
5. Run ESLint on the changed JavaScript/Vue files with `node node_modules/eslint/bin/eslint.js --no-ignore <files>`; the repository's loose `*.js`/`*.vue` ignore patterns otherwise silently skip nested source files. Then run git diff --check and the production build. Confirm no legacy sys_base_wt_hd/cc/ys writes, no raw ${authStr} in the changed customer-order boundary, and no new-order calls into legacy SysBaseWt side-effect services.
6. From hh-az-boss, run ./gradlew.bat testDebugUnitTest assembleDebug only when Android code changed.
7. For Android visual changes, keep the mock Gateway and tokens under S:/tool/pi/tmp, inspect list/form/detail and navigation on a compatible emulator, then stop the mock and clear injected data.
8. For Web runtime verification, use vue.config.js's default port 2999. Use real Gateway APIs and real uploads; do not add fixtures or demo fallback. Check customer mobile/desktop, business desktop, history records, all action states, root navigation, console errors, loading masks, dialogs, horizontal overflow, and finance/service wording exposure.
9. Before runtime verification, confirm both customer-order migrations and menu SQL state in ft_base, then verify the user-restarted service PID/start time and health. Never restart or terminate IDEA-owned JVMs.
10. If the checked-in stock fix is not deployed, start an isolated worktree hh-stock on a separate port with Nacos config/discovery disabled, verify its exact command line, and stop only that process afterward.
11. Log in through the real Gateway with fresh internal and temporary customer accounts. Store tokens only under S:/tool/pi/tmp and verify customer identity resolves to deptId=customId plus tenantId; account ID must not be used as customer ID.
12. Run the internal and customer runtime state flows, including draft CRUD, version conflict, concurrent single-root confirmation, submit/withdraw, reject/resubmit/approve, terminal guards, root projection, legacy protections, customer/source isolation, and historical stock isolation.
13. Before cleanup, assert the SQL runner target: customer/order/menu data must be ft_base and historical stock applications must be ft_data. Preflight exact IDs, tenant, markers, root relationships, and dependent row counts.
14. Log out both tokens. Delete root dependents before ORDER_ROOT rows, then orders, accounts, contacts/ranges, and customers in ft_base; delete stock goods/cars before applications in ft_data; delete uploaded files and token files; stop only agent-started services.
15. Run final marker-and-ID audits in both ft_base and ft_data and require every relevant count to be zero. Retain only reusable E2E scripts and intentional screenshot evidence under S:/tool/pi/tmp.
16. Update S:/note/xl-ht/商务委托单 with exact commits, test counts, runtime paths, visual result, cleanup result, and any change not yet merged, restarted, or deployed.
## Pitfalls
- Always include -am in the hh-system and focused hh-stock Maven commands; otherwise tests can compile against older locally installed artifacts.
- The hh-ft-ui `.eslintignore` entries `*.js` and `*.vue` are loose matches under the installed ESLint and can make a targeted lint command report only ignored-file warnings. Use `--no-ignore` for explicit changed-file verification and require zero output/errors.
- A worktree may not have node_modules. Reuse the main workspace dependencies with NODE_PATH; for webpack production builds a real node_modules directory junction may be required, but do not change lockfiles.
- Do not stop IDEA-started services. A worktree test pass or isolated-port runtime check is not evidence that 8882/8884 loaded the commit; deployment claims require merge plus user restart.
- Use port 2999 for hh-ft-ui local development and worktree verification. Do not silently move the project to another port.
- Keep tokens, credentials, SQL helpers, logs, screenshots, uploads, and runtime scripts under S:/tool/pi/tmp or the configured upload root, and remove one-off artifacts after cleanup.
- Do not create CONFIRMED orders without a deterministic physical cleanup path. ORDER_ROOT cannot be removed through ordinary APIs.
- MySQL does not support CAST(... AS BIGINT) used by this mapper path; use and test a MySQL/H2-compatible numeric conversion such as SUBSTRING(...) + 0.
- For customer getInfo, user.userName is the company display name and user.deptId must remain the bound customId. Verify roles and tenant separately.
- Do not mix ft_base and ft_data SQL runners. Read live datasource snapshots without printing passwords and assert SELECT DATABASE() before cleanup or DDL.
- Remote MySQL can return ERROR 2013 during the initial handshake. After any DDL error, inspect whether it committed before retrying.
- Both customer-order migration files are one-time fail-fast scripts. Do not mask drift with IF NOT EXISTS, INSERT IGNORE, REPLACE, or ON DUPLICATE KEY.
- Do not manufacture rollback failures on shared ft_base with persistent triggers, constraints, or long locks. Use an isolated database or purpose-built failure injection.
- In Windows Git Bash use 2>/dev/null, never 2>nul. Quote PowerShell scripts so Bash does not expand PowerShell $variables.
## Verification
1. The focused customer-order hh-system suite reports zero failures; after the Web, action-route P0, and ORDER_ROOT branches are integrated, the full hh-system suite reports 311 tests with zero failures/errors.
2. The full hh-safety suite reports 66 passes, including signed GATE_ENTRY dispatch contracts.
3. The focused hh-stock customer scope/mapper suite reports 8 passes, including the MySQL conversion contract.
4. Customer-order Web reports 40 passes; customer-order SQL 5; business-entrustment SQL 10; business work-entrustment 44. The combined Web/SQL evidence is 99/99.
5. Explicit `--no-ignore` ESLint, git diff --check, and the production build succeed. Existing unrelated webpack warnings are listed rather than misreported as new failures.
6. Android testDebugUnitTest and assembleDebug succeed when Android code changed.
7. Browser verification on port 2999 records zero relevant console errors, no body overflow, no visible loading masks/dialogs, valid nonblank screenshots, complete action buttons, and no finance/service wording in customer views.
8. Runtime flows prove server-bound customer identity, ignored spoofed fields, full customer/business state actions, exactly one active ORDER_ROOT per confirmed order, root navigation, old-interface protection, and no old detail-table side effects.
9. Historical stock verification proves account ID can differ from customId while results still filter by customId plus tenantId, and goods detail SQL runs on real MySQL.
10. The ft_base menu query returns exactly one customer-order menu and zero symmetric role-set differences from menu 3984. Final ft_base and ft_data marker/ID audits are all zero; uploaded files and temporary tokens are absent; agent-started isolated services no longer listen.
11. The integrated branch records exact merge/contract commits and distinguishes worktree/isolated-port evidence from IDEA service deployment; deployment is claimed only after merge and user-controlled restart.
12. Confirmation transaction rollback is claimed only after an isolated failure-injection test proves both the order transition and root insert roll back together.