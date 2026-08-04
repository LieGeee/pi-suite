---
name: install-pi-subagent-extension
description: Install or verify the official subprocess-based Pi subagent extension in this S:/tool/pi configuration.
version: 1
created: 2026-05-22
updated: 2026-05-22
---
## When to Use
Use when adding, repairing, or verifying sub-agent support in this repo's local Pi configuration (`S:/tool/pi`, agent dir `S:/tool/pi/agent`).

## Procedure
1. Use the official example as the source of truth: `C:/Users/leizh/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/examples/extensions/subagent/`.
2. Install extension files under `S:/tool/pi/agent/extensions/subagent/` with `index.ts` and `agents.ts`.
3. Install agent profiles under `S:/tool/pi/agent/agents/*.md` and workflow prompts under `S:/tool/pi/agent/prompts/*.md`.
4. Do not add `S:/tool/pi/agent/extensions/subagent/index.ts` to `settings.json`; `agent/extensions/subagent/index.ts` is auto-discovered. Keeping it both auto-discovered and explicit risks duplicate registration/conflict diagnostics.
5. In this local version, maintain `permissions.ts` with permission levels:
   - read: `read,grep,find,ls`
   - exec: read + `bash`
   - write: exec + `edit,write`
6. Keep default permission read-only. Tool calls and `/subagent` command can explicitly set `permission: "exec"` or `permission: "write"`.
7. Set local agent model frontmatter to `gpt-5.5` unless the user's model config changes.

## Pitfalls
- Running `npx tsx` directly from `S:/tool/pi` may fail on `@mariozechner/*` imports because that directory does not have Pi's node_modules. Pi's extension loader provides aliases/virtual modules.
- Official workflow prompts assume worker can write; update prompts to set per-step permissions explicitly or worker will be capped to read-only by default.
- Agent profile `tools:` are treated as an additional cap; an explicit write permission will not add write tools to an agent that declares only read tools.

## Verification
Run:
```bash
npx tsx --test agent/extensions/subagent/permissions.test.ts
node -e "for (const p of ['agent/settings.json','agent/models.json']) JSON.parse(require('fs').readFileSync(p,'utf8')); console.log('json ok')"
npx esbuild agent/extensions/subagent/index.ts --bundle --platform=node --format=esm --external:@mariozechner/* --external:typebox --outfile=/tmp/pi-subagent-check.mjs
PI_CODING_AGENT_DIR="S:/tool/pi/agent" node --input-type=module - <<'JS'
import { DefaultResourceLoader } from 'file:///C:/Users/leizh/AppData/Roaming/npm/node_modules/@mariozechner/pi-coding-agent/dist/index.js';
const loader = new DefaultResourceLoader({ cwd: 'S:/tool/pi', agentDir: 'S:/tool/pi/agent' });
await loader.reload();
const res = loader.getExtensions();
console.log(JSON.stringify({ errors: res.errors.map(e => ({ path: e.path, error: String(e.error ?? e) })), tools: res.extensions.flatMap(e => [...e.tools.keys()]), commands: res.extensions.flatMap(e => [...e.commands.keys()]) }, null, 2));
JS
```
Expected: tests pass, JSON ok, esbuild succeeds, loader errors array empty and includes `subagent` in tools and commands.