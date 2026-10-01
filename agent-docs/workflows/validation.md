# Validation workflow

Last updated: 2026-10-01.

```bash
node --test tests/*.test.js
bash -n install.sh browser-bridge/*launcher.sh
node --check browser-extension/background.js
node --check browser-extension/content-scripts/cursor.js
node --check browser-extension/popup.js
```

CI runs Node 22 behavioral tests, core syntax, shell syntax, JSON schema parsing, and skill frontmatter checks. Resource tests check manifest assets; schema tests enforce parity with exported MCP definitions. The installer test uses fake service commands and therefore does not prove a real installation or systemd enablement.

The opt-in live checker provides a copyable fixture workflow and closes only its created tab:

```bash
node tests/live-smoke.js '<exact connected profile email>'
```

It requires ffmpeg and ffprobe, creates a localhost HTTP fixture, reads back field/event state with evaluate, verifies full-page PNG and H.264 output, and leaves artifact paths under /tmp. It does not certify real websites.

For other live checks, serve an innocuous local fixture with an input, button, scroll area and event counters. Open a dedicated background tab using the exact connected profile, then validate click/double-click, clear/type/Space, plain paste, batch, generation-specific snapshot UID, screenshot dimensions, and optionally recording/ffprobe. Read back fixture values/counters; report dispatch success separately from application state. Close only the new tab ID and stop the fixture server. Never call global cleanup to finish a live audit.

Verify profile and daemon state again after reloads. Do not infer Sheets reliability from an input fixture. Rich HTML/canvas paste, iframe locators, dialogs on real workflows, and concurrency across separate agents need their own scoped checks.

Knowledge links: run `/home/jayant/.codex/skills/agent-knowledge-network/scripts/verify-links.sh agent-docs` where installed, or resolve Markdown links relative to their containing file. For a fresh-reader check, provide only AGENTS and the network to an isolated reviewer and ask for the route/commands/limits for a concrete task.

## See also

- [Development](development.md)
- [Automation gotchas](../gotchas/automation-accuracy.md)
- [Audit evidence](../../docs/audit-2026-10-01.md)
