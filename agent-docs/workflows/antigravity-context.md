# Antigravity browser context synchronization

Last updated: 2026-10-01.

Canonical browser policy is [the global browser guide](../../integration/antigravity-global.md). The three installed global entry files ~/.gemini/GEMINI.md, ~/.gemini/config/GEMINI.md and ~/.gemini/config/AGENTS.md route browser tasks there. Root GEMINI.md routes this project to AGENTS/current status. Detailed skills load only for the relevant task.

```bash
python3 scripts/sync-antigravity-context.py
```

This copies the five browser skill packages and updates only recognized browser entry content, preserving unrelated rules. Project-network links in copied skills are localized to the actual checkout; links within the skills remain relative. Existing global files and skill folders are backed up under ~/.gemini/config/context-backups, outside skill/rule discovery directories. It does not install/restart the daemon or change MCP account/server settings. Do not rerun install.sh merely to sync docs.

After MCP implementation/schema changes, restart/reconnect the external MCP client. Start a fresh Antigravity chat or refresh its rules/skills context to pick up new instructions. Read-back proves installed file content; it does not prove the desktop agent loaded it. Ask the fresh agent to identify its active browser guide and execute a dedicated scratch fixture before claiming end-to-end autoload.

[Official rule documentation](https://www.antigravity.google/docs/rules/) distinguishes standalone global entries, triggered modular rules and file includes. We use explicit read routing to avoid inlining the whole knowledge network into every workspace prompt.

## See also

- [Global guide](../../integration/antigravity-global.md)
- [Project entry](../../GEMINI.md)
- [Install/reload](install-and-reload.md)
- [Validation](validation.md)
