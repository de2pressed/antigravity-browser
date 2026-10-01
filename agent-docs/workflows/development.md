# Development workflow

Last updated: 2026-10-01. Run from repository root.

1. Read AGENTS and relevant status; inspect `git status --short`.
2. For extension edits, remember the live daemon watcher can reload Chrome. Stage complicated edits in a temporary copy or coordinate a reload window. Do not reload an active recording.
3. Add behavioral regression tests for substantive bugs. Bridge tests use isolated socket/log paths; install tests use a temporary HOME and fake systemctl/loginctl. Chrome worker tests use API mocks.
4. Run `node --test tests/*.test.js` and syntax checks. Verify only needed live flows on dedicated scratch pages.
5. Update canonical MCP TOOLS and regenerate schemas if the interface changes:

```bash
node - <<'JS'
const fs = require('fs');
const { TOOLS } = require('./browser-bridge/mcp-server');
for (const tool of TOOLS) fs.writeFileSync(`mcp-schemas/${tool.name}.json`, JSON.stringify({name: tool.name, description: tool.description, parameters: tool.inputSchema}, null, 2) + '\n');
JS
```

6. Update docs/status and verify links. Git publication requires separate user authorization.

## See also

- [Validation](validation.md)
- [Install/reload](install-and-reload.md)
- [Clients](../servers/clients.md)
- [Entry point](../../AGENTS.md)
