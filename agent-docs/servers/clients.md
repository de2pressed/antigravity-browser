# CLI, MCP, schemas, and skills

Last updated: 2026-10-01.

CLI source `browser-bridge/cli.js` uses one Unix socket connection per command, correlates request IDs, prints results, and exits nonzero on failed operations. `--help` is the authoritative command list. Tab IDs must be positive integers; malformed strings cannot be truncated by parseInt. Batches take their JSON payload separately from flags. CLI defaults to 35 seconds, with 95 seconds for batch/recording stop/record commands. `activate` explicitly activates; `--bring-to-front` also focuses the Chrome window.

MCP source `browser-bridge/mcp-server.js` uses newline-delimited JSON-RPC on stdio. Tools are exported in `TOOLS`; files in `mcp-schemas/` mirror them. Unknown tools and missing/basic type-invalid arguments fail before dispatch. `record_start`/`record_stop` map to start_recording/stop_recording; record_actions maps to run_actions with record=true. Failed operation results set isError=true. Screenshots emit image content; snapshots emit their tree text.

MCP can start a daemon using a script relative to itself. It does not unlink the shared socket while probing. Socket close rejects promptly instead of waiting for a timeout. Client disconnect/timeouts do not cancel extension execution or undo actions. Do not automatically retry a mutation after losing confirmation.

Five `skills/` packages are documentation; the installer copies them to `~/.gemini/config/skills`, backing up prior folders. Changes here do not modify those installed copies unless installation/sync is run. Playwright guidance needs a separately configured Playwright environment. Console/network interception, viewport emulation, arbitrary CDP dispatch, and browser file downloads are not dedicated bridge commands.

## See also

- [Status](../status/clients-status.md)
- [Development](../workflows/development.md)
- [Validation](../workflows/validation.md)
- [Automation gotchas](../gotchas/automation-accuracy.md)
- [CLI skill](../../skills/agent-browser/SKILL.md)
