---
name: "verify-xlht-action-route-p0"
description: "Verify xl-ht P0 action routing, signed hh-system-to-hh-safety dispatch, live migration, gate-entry idempotency, and runtime health."
version: 5
created: "2026-07-29"
updated: "2026-07-30"
---
## When to Use
Use after changing shared Action contracts, action_route resolution/snapshots, NacosActionHttpClient/signing, hh-safety internal action gateway or GateEntry Handler, safety gate-issue idempotency, P0 migration SQL, or the live Druid/Nacos runtime configuration.

## Procedure
1. Use S:/code/xl-ht on dev_business for the integrated baseline unless the task explicitly names an isolated worktree. Preserve user-owned workspace changes and do not modify hh-ft-ui.
2. Run the full integrated hh-system suite: mvn -f S:/code/xl-ht/hh/pom.xml -pl hh-modules/hh-system -am test. The 2026-07-30 baseline is 303 tests.
3. Run the full hh-safety suite: mvn -f S:/code/xl-ht/hh/pom.xml -pl hh-safety -am -Dsurefire.failIfNoSpecifiedTests=false test. The 2026-07-30 baseline is 66 tests.
4. Run git diff --check, scan changed Java for Java 9+ APIs, and scan hh-system production sources for BusinessEntrustmentActionHandler, DriverGateEntryActionHandler, BusinessEntrustmentExecutionContext, RemoteSafetyVehicleAppointmentService, and TransportGate DTO dependencies.
5. Before any database migration, load the actual hh-system-pro.yml/ft_base and hh-safety-pro.yml/ft_data connections from Nacos, query legacy/open action counts, and take schema/data backups. Never execute migration SQL as part of ordinary code verification.
6. For the migration, confirm update_safety_vehicle_appointment.sql explicitly USEs ft_data for safety facts and ft_base for menus. Execute update_safety_vehicle_appointment.sql and update_action_route_platform_p0.sql only after authorization, then execute them a second time and verify repeat safety, route columns/dictionaries/triggers, gate tables, and composite unique-index column order.
7. Keep one shared ACTION_PLATFORM_SIGNING_SECRET outside source, SQL, notes, logs, and Nacos. Build executable JARs and launch Windows Java with -Dfile.encoding=UTF-8 plus explicit application name, Nacos address, UUID namespace, and shared-config settings.
8. Before formal cutover, start shadow instances on unique service names and unused ports. Verify local health, healthy Nacos registration, and a correctly signed schema-version rejection. Stop shadows and verify ports and Nacos hosts are gone.
9. For full platform dispatch, the request must originate from BusinessEntrustmentActionDispatcher/NacosActionHttpClient through Spring Cloud LoadBalancer; a script-side Nacos lookup plus HTTP is only a gateway smoke. Use isolated tenant-tagged test rows, record baseline counts, and clean references, gate items, QR rows, appointments, batches, actions, and entrustments in reverse dependency order.
10. Verify a deterministic schema rejection, first success, same-action replay with created=false, two-thread same-key first dispatch with one create/one replay, and same-key different-intent permanent rejection. Verify both responses reference the same appointment and no duplicate facts exist.
11. After any client timeout, wait at least the target Druid maxWait before cleanup, then run cleanup twice and verify baseline counts. This prevents a still-running target transaction from committing after the first cleanup query.
12. If the first successful request stalls before the first hh-safety SQL, inspect Druid JMX counters. ActivePeak low plus DiscardCount/CreateCount increases indicates stale idle physical connections, not pool exhaustion. The verified hh-safety Nacos settings are validationQueryTimeout=2, keepAlive=true, and keepAliveBetweenTimeMillis=120000; verify them first in a no-override shadow, then in the formal process.
13. Finish by checking 8084/8882 health, exactly one healthy Nacos host per formal service, no shadow hosts/listeners, zero temporary rows, git status, and the Obsidian handoff under S:/note. Distinguish current development-runtime deployment from production release approval and HA validation.

## Pitfalls
- Do not run live migration SQL during ordinary unit-test verification.
- Never add a signing-secret fallback or expose the real secret value/fingerprint-to-secret mapping in source, SQL, notes, tests, Nacos content, or logs.
- Executable JAR launches need explicit spring.application.name/Nacos settings; otherwise they may query null-pro.yml and lose datasource/MyBatis configuration.
- Windows launches require -Dfile.encoding=UTF-8 or Chinese Nacos YAML may fail with MalformedInputException.
- Use Nacos namespace UUID 6a96adcb-3bc6-4896-b6c6-4a882665b6ac, not the zihao display name.
- PowerShell variables are case-insensitive: do not use $host because it collides with the read-only $Host variable.
- Druid requires keepAliveBetweenTimeMillis to be strictly greater than timeBetweenEvictionRunsMillis; 60000/60000 prevents startup. The verified pair is 120000/60000.
- A successful target commit can occur after NacosActionHttpClient's 10-second read timeout. Do not immediately claim cleanup succeeded; wait for maxWait and re-query.
- A script-side signed request proves the gateway and HMAC contract, not NacosActionHttpClient or the execution service lifecycle.
- P0 rejects PROCESSING. AUTO workers, async callbacks, compensation, standalone extraction, multi-tenant routes, multi-instance failover, and production HA remain out of scope.
- Maven emits known nonblocking warnings for the settings.xml blocked tag and missing maven-compiler-plugin versions.
- S:/note is not a Git repository; preserve wikilink navigation and update runtime truth there separately from source commits.

## Verification
1. hh-system reports Tests run: 303, Failures: 0, Errors: 0 on the integrated baseline.
2. hh-safety reports Tests run: 66, Failures: 0, Errors: 0.
3. git diff --check and Java 8/old-handler scans report no errors or matches.
4. ft_base has 8 route snapshot columns, exactly two route rows, GATE_ENTRY enabled, DRIVER_GATE_ENTRY legacy trigger disabled, and no open legacy actions.
5. ft_data has gate batch/item tables and the unique indexes tenant_id,idempotency_key and batch_id,execution_ref.
6. A full live smoke reports deterministic EXHAUSTED rejection, first create plus replay, one-create/one-replay concurrency, permanent intent mismatch rejection, and restored baseline counts.
7. 8084 and 8882 return UP; Nacos has one healthy formal instance each and no shadow instances/listeners.
8. The formal hh-safety Druid pool has the Nacos settings bound and no unexpected DiscardCount increase during the final smoke.
9. The workspace contains only intentional/user-owned changes, and the handoff note truthfully leaves production release approval, monitoring, and HA tests incomplete.