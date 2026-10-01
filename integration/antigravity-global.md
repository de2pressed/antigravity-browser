# Antigravity browser operating guide

Last updated: 2026-10-01. Scope: browser tasks in any Antigravity workspace. Keep unrelated project rules and user instructions in force.

## Before browser work

Read the workspace's AGENTS.md/GEMINI.md and relevant project context first. The browser bridge lives at `/home/jayant/projects/antigravity-browser`; read its `agent-docs/status/global.md` for recent verification and limits, then `skills/browser-control/SKILL.md`. Reuse already-read context in a conversation; route again when target, task or environment changes. Read only the relevant skill/reference, not the entire network.

| Task | Read in bridge checkout |
|---|---|
| General websites / existing tabs | `skills/browser-control/SKILL.md` |
| CLI / localhost browser verification | `skills/agent-browser/SKILL.md` |
| Google Sheets | `skills/browser-google-sheets/SKILL.md`; modeling/formatting also `skills/spreadsheets-mastery/SKILL.md` |
| Visual/viewport QA | `skills/playwright-interactive/SKILL.md` as a checklist; execution needs a separately configured, user-authorized Playwright environment |
| Bridge outage / reconnect / reload | `agent-docs/workflows/install-and-reload.md`, `agent-docs/servers/clients.md` |

## Execution and safety

Use the Antigravity Browser Bridge's available `browser_*` MCP tools (the client may prefix names) or `agy-browser`; inspect the actual tool schema or CLI --help. Do not assume Chrome DevTools MCP, Puppeteer, raw CDP passthrough, console/network-event capture, viewport emulation or Playwright are available. If a needed capability is absent, report the gap before choosing another browser/session.

Check `agy-browser status` and `agy-browser tabs` before selecting a target. Specify an exact connected profile for new tabs; open in background. A browser profile email does not establish the website's active account. Never activate/focus a window unless requested.

Track the tab IDs created by this task. `agentOwned` includes tabs claimed by any client, so it does not prove this task created or may use a tab. Claim an existing tab only when the user authorized that exact page/task. Do not borrow idle user tabs. Close only this task's recorded scratch IDs; avoid global cleanup because ownership is shared across agents.

Use current snapshot UIDs or valid CSS selectors. For semantic matching use find_and_click text/role fields; Playwright `:has-text` is not CSS. Batches target one tab; use them for known steps and inspect state before dependent/irreversible steps. Timeouts do not cancel actions: read back outcomes before retrying.

Paste dispatch/insertion success does not prove saved values or rich formatting. Verify visible content, formulas, row/cell counts and save/export state as relevant. Focus emulation does not guarantee foreground performance. Existing confirmation, secret-handling and external-action authorization rules remain binding.

## See also

- [Bridge entry](../AGENTS.md)
- [Current status](../agent-docs/status/global.md)
- [Global context synchronization](../agent-docs/workflows/antigravity-context.md)
