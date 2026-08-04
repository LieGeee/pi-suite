---
name: document-xlht-live-db-schema
description: Use when documenting xl-ht database tables, module-to-table mapping, or Obsidian schema notes from the current live database.
version: 1
created: 2026-06-04
updated: 2026-06-04
---
## When to Use

Use for xl-ht/xl-ht schema documentation tasks where the user wants to understand project structure, modules, and involved database tables.

## Procedure

1. Treat `S:\note` as the notes root for Obsidian docs.
2. Use the current live database as source of truth, not SQL backup files. SQL backups may include unapplied `CREATE TABLE` definitions.
3. Read active Nacos pro configs for Java services and connect read-only to `information_schema` for table/column/index metadata.
4. Do not print or write passwords, full JDBC URLs, API keys, or secret keys into notes.
5. Export metadata to temporary TSV files if needed: `services.tsv`, `tables.tsv`, `columns.tsv`, `indexes.tsv`.
6. Group live MySQL tables by schema and prefix:
   - `ft_base`: `sys_*`, `sys_base_*`, `sys_contract*`, `gen_*`, `QRTZ_*`
   - `ft_data`: `ft_stock_*`, `ft_transport_*`, `ft_forwarder_*`, `ft_danger_*`, report tables
7. Scan Java/XML under `hh/hh-modules` and `hh/hh-api` for live table names to produce module mappings.
8. Write Obsidian notes under `S:\note\AI__Uses\项目\海关系统架构\xl-ht表结构梳理\` with a hub `00-总览.md`, top navigation, and wikilinks.

## Pitfalls

- Avoid trusting `SQL备份/*.sql` as active schema.
- Avoid leaking credentials from Nacos, backup SQL, or bootstrap files.
- Long bash here-doc Python scripts can be truncated; write a generator file first, then execute it.
- `information_schema.tables.table_rows` is approximate for InnoDB.
- `hh-workflow`/Go approval/task tables are a separate workflow capability; do not mix them into the MySQL business table mainline unless explicitly requested.

## Verification

Before claiming completion:

1. Count generated markdown files.
2. Verify every note contains `### 导航` and `[[00-总览]]`.
3. Run a sensitive string scan for `password`, `passwd`, `jdbc:mysql`, known hosts, usernames, API keys, and secret keys.
4. Read `00-总览.md` to confirm table counts and navigation are present.