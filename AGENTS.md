# Agent entry point

Last updated: 2026-10-01 (Asia/Kolkata). Read this file and [global status](agent-docs/status/global.md) at every session start. First-time readers also read [network conventions](agent-docs/00-readme.md).

## Task router

| Task | Read first |
|---|---|
| Antigravity global browser routing / installed skills | [Context sync](agent-docs/workflows/antigravity-context.md), [browser guide](integration/antigravity-global.md) |
| Understand the project | [Overview](agent-docs/01-project-overview.md), [map](agent-docs/02-infrastructure-map.md) |
| Tab safety, profile routing, reconnects | [Daemon](agent-docs/servers/daemon.md), [ownership gotchas](agent-docs/gotchas/ownership-and-routing.md) |
| Clicking, typing, paste, snapshots, cursor | [Extension](agent-docs/servers/extension.md), [automation gotchas](agent-docs/gotchas/automation-accuracy.md) |
| Native messaging or recording failures | [Native host](agent-docs/servers/native-host.md), [recording gotchas](agent-docs/gotchas/recordings.md) |
| CLI/MCP commands or tool schemas | [Clients](agent-docs/servers/clients.md), [development](agent-docs/workflows/development.md) |
| Install, move clone, restart services | [Install/reload](agent-docs/workflows/install-and-reload.md), [access index](agent-docs/access/local-access.md) |
| Verify changes or audit evidence | [Validation](agent-docs/workflows/validation.md), [reports](agent-docs/reference/reports-index.md) |
| Resume unfinished work | [Global status](agent-docs/status/global.md), then component status links |

## Scope and standing rules

This is Jayant's local Chrome automation bridge. A change can affect logged-in personal and work Chrome profiles. Scope browser verification to dedicated scratch tabs and known IDs; never bulk-close tabs during an audit. A profile email does not prove the account authenticated on a page.

Local analysis, fixes, regression tests, and documentation were authorized on 2026-10-01. That authorization does not authorize sending messages, submitting forms, changing cloud resources, or publishing Git commits/PRs unless the user separately authorizes them. On 2026-10-01 the user explicitly authorized committing/pushing this audit with devops942 author/committer identity, then authorized active de2pressed GitHub authentication for publication. Obtain explicit authorization for external account actions and Git pushes. Preserve unrelated working-tree changes.

Never store cookies, tokens, session exports, account credentials, or private keys in docs or tracked files. `keys/`, `env-files/`, `creds/`, and `.env*` are ignored. Manifest `key` is a public extension identity key; it is not an account credential. Paths and access mechanisms belong in the access index.

Use current evidence for runtime claims. Tests using Chrome mocks do not prove behavior on Sheets, rich editors, iframes, or authenticated sites. Timeout/disconnect does not cancel browser work. Check the page before retrying a mutation. Claimed user tabs are retained by cleanup; created tabs are shared across bridge clients, so cleanup can affect another agent's scratch work.

## Locations and source of truth

Repository: `/home/jayant/projects/antigravity-browser`; GitHub remote: `de2pressed/antigravity-browser`. Legacy symlinks under `~/.gemini/antigravity/` point to `browser-extension` and `browser-bridge` in this checkout; verify before relying on them.

Critical files: `browser-extension/background.js`, `content-scripts/cursor.js`, `manifest.json`, `popup.js`; `browser-bridge/bridge-daemon.js`, `host.js`, `cli.js`, `mcp-server.js`; `install.sh`; `systemd/antigravity-browser-bridge.service`. Tool definitions exported by `mcp-server.js` are canonical; tests compare `mcp-schemas/` against them. `skills/` contains shipped guidance, not runtime code or automatically synchronized installed copies.

Default socket: `/tmp/antigravity-browser-bridge.sock`, with a sibling PID lock. `ANTIGRAVITY_SOCKET_PATH` supports isolated tests. The systemd user service is `antigravity-browser-bridge.service`. The installer pins the discovered Node executable in ignored `browser-bridge/node-runtime.sh`; launchers resolve their own directory. Node >=22 is the supported floor. `ffmpeg` is optional except for recording.

## Quick verification

Run from the repository root:

```bash
git status --short
node --test tests/*.test.js
bash -n install.sh browser-bridge/*launcher.sh
systemctl --user is-active antigravity-browser-bridge.service
node browser-bridge/cli.js status
```

## Update discipline

Every turn, mentally note changes, discoveries, and decisions. Every 2-3 turns, batch updates to affected component status, gotchas, and decisions. At session end, always update global and changed component statuses with dates, actual checks, and explicit unverified items. Stable architecture belongs in component briefs; current health belongs in status files. Keep this entry point under 6KB, briefs under about 5KB, and cross-links relative. Do not automate documentation writes with cron.

## See also

- [Network conventions](agent-docs/00-readme.md)
- [Current status](agent-docs/status/global.md)
- [Decisions](agent-docs/decisions.md)
