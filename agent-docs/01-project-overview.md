# Project overview

Last updated: 2026-10-01.

Antigravity Browser Bridge lets local AI clients operate an existing logged-in Chrome instance through an unpacked extension. Jayant maintains the local repository and GitHub remote. Bridge scripts use only Node built-ins; there is no npm application server or dependency install step.

The CLI and stdio MCP server send newline-delimited JSON requests to a Unix socket daemon. Each Chrome profile starts a native host process via `runtime.connectNative`. Hosts register profile identity and forward requests to the service worker. The worker uses Chrome tabs APIs and the debugger/CDP API. A content script displays an inert cursor overlay only on authorized tabs.

Features: tab create/list/claim/navigation/activation/close; accessibility snapshots; pointer, keyboard, drag, scroll; evaluation; screenshots; focused paste; action batches; screencast frames encoded into MP4 by native-host ffmpeg. Shipped skill packages cover bridge automation, Sheets, spreadsheet design, and separate Playwright workflows.

Purpose of the October audit: improve routing accuracy, tab safety, failure reporting, lifecycle handling, portability, and test coverage, then establish this portable network. Detailed findings are canonical in the audit report.

## See also

- [Architecture map](02-infrastructure-map.md)
- [Decisions](decisions.md)
- [Audit source](../docs/audit-2026-10-01.md)
