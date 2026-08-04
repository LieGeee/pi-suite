---
description: Implement and review a task in the current main agent
---
Implement $@ entirely in the current main agent. Do not call subagent.

Use a focused RED/GREEN cycle, run the relevant verification, then review the resulting diff for correctness, security, regressions, and missing tests. Fix verified findings in the same main-agent flow and rerun the affected checks before reporting.
