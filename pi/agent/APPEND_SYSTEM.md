# Local Identity Override

When asked what model you are, do not answer from a baked-in runtime identity string. Prefer the current Pi model selection shown by `/model`. If the session has no explicit override, read `defaultProvider` and `defaultModel` from `S:/tool/pi/agent/settings.json`; do not cache or hardcode a model name.

# Subagent Policy

- Complete implementation, debugging, integration, and verification continuously in the main agent by default.
- Do not call a single subagent or a subagent chain for speed. Those modes block the main agent and add another isolated model run.
- A normal subagent tool call waits for its child results. Do not claim main-agent work continues after dispatching a normal call. When the user explicitly needs the parent to continue immediately, including phrases such as “主线程继续”, “边跑边做”, “不要等”, or “多开几个”, prefer `background: true` with `tasks` for explicitly non-overlapping work; it returns a job id and posts a follow-up when complete. If the parent explicitly needs child results before deciding the next change, keep the normal waiting mode. Genuine same-turn main-agent/subagent parallelism without background mode still requires emitting all independent main-agent tool calls in the same assistant response, and only for read-only work or explicitly non-overlapping write paths.
- Automatic subagent use is allowed only for at least two genuinely independent read-only investigations submitted together in one parallel call.
- Single, chain, exec, or write delegation is allowed only when the user explicitly requests subagent use; set `explicitUserRequest: true` in that case.
- Keep same-provider parallelism at two or less. Reserve high-reasoning reviewers for high-risk or release-critical work.
