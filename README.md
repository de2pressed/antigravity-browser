# Antigravity Browser Bridge

Chrome automation through a Manifest V3 extension, a native messaging host, and a local Unix socket daemon. The CLI and MCP server share the same browser connection. No npm dependencies are required for the bridge itself.

## Architecture

`CLI / MCP → Unix socket daemon → native host per Chrome profile → extension → Chrome DevTools Protocol`

The extension implements tab management, accessibility snapshots, mouse and keyboard input, evaluation, screenshots, paste, sequential action batches, and screencast recording. Five bundled skills provide browser, Sheets, spreadsheet, and Playwright guidance. Playwright is a separate optional tool; the bridge does not provide a Playwright endpoint or arbitrary CDP command passthrough.

## Installation

Requirements: Linux, Google Chrome, Node.js 22 or newer; `ffmpeg` with `libx264` for MP4 recording.

```bash
git clone https://github.com/de2pressed/antigravity-browser.git
cd antigravity-browser
./install.sh
```

The installer uses the actual clone path, records the discovered Node executable locally, registers the Chrome native host, and enables the systemd user service. Existing skill folders are backed up before replacement. Load `browser-extension` using **Load unpacked** on `chrome://extensions/`. Its public manifest key fixes the ID to `fkklpoodihheinpcjpldofbdbmabofcl`.

The local runtime selection lives in ignored `browser-bridge/node-runtime.sh`. Rerun installation when moving the clone or removing the selected Node version. Installer skill synchronization does not happen automatically after source edits.

## CLI

```bash
agy-browser status
agy-browser tabs
agy-browser new --profile '<exact connected email>' 'https://example.com'
agy-browser snap <tabId>
agy-browser fc <tabId> '#search'
agy-browser type <tabId> 'query' --clear --enter
agy-browser paste <tabId> 'text'
agy-browser batch <tabId> '[{"type":"click","selector":"#search"},{"type":"type","text":"query","enter":true}]'
agy-browser screenshot <tabId> -o /tmp/page.jpg
agy-browser record <tabId> '[{"type":"scroll","deltaY":400}]' -o /tmp/workflow.mp4
agy-browser close <tabId>
```

Use `agy-browser --help` for the complete implemented command list. Profile selection is required when multiple profiles are connected. Unknown or ambiguous profile hints and missing tab IDs fail explicitly. Tabs open in the background unless `--foreground` is requested. `activate` activates a tab; `--bring-to-front` also focuses its window.

Existing user tabs require an explicit `claim <tabId>` before mutation. A claim grants interaction permission; `cleanup` closes only tabs created by the extension, preserving claimed user tabs. Legacy ownership records without creation provenance are also preserved.

Snapshots return `uid=<tabId>_<generation>_<index>` handles. Use the latest snapshot after navigation or page changes. Batches target one tab and execute sequentially; concurrent requests for the same tab are serialized. A failed batch reports how many actions completed. Requests are not rolled back or canceled on a client timeout; inspect page state before retrying.

Paste dispatches one clipboard event. Ordinary editable fields fall back to native text insertion when the event is not consumed. Rich editors must handle the event; success acknowledges dispatch/insertion, and application state still needs verification. The bridge does not overwrite the system clipboard. JavaScript dialogs are dismissed instead of automatically accepted.

## MCP

Configure your MCP client with the absolute launcher path:

```json
{
  "mcpServers": {
    "antigravity_browser": {
      "command": "/absolute/path/to/antigravity-browser/browser-bridge/mcp-launcher.sh",
      "args": []
    }
  }
}
```

`browser-bridge/mcp-server.js` exports the canonical tool definitions. `mcp-schemas/` mirrors them; regression tests enforce equality. MCP uses JSON-RPC messages separated by newlines on stdio. Batch and recording stop requests have a 90-second host budget; CLI clients wait 95 seconds. Native messages sent to Chrome have a 1 MiB limit, so split oversized payloads.

## Development and handoff

```bash
node --test tests/*.test.js
bash -n install.sh browser-bridge/*launcher.sh
node --check browser-extension/background.js
node browser-bridge/cli.js status
```

Tests use isolated sockets, temporary HOME directories, fake native hosts, and Chrome API mocks. They do not operate on personal browser tabs. Live browser checks must use dedicated scratch tabs and close only the IDs created by that check. The daemon watches extension source, checks all extension JavaScript files, and requests reloads; active/finalizing recordings block reload.

Start future work with [AGENTS.md](AGENTS.md) and [current status](agent-docs/status/global.md). The [audit report](docs/audit-2026-10-01.md) records confirmed fixes, validation, and remaining limits.

## License

MIT. See [LICENSE](LICENSE).
