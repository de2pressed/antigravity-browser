# Browser Control Troubleshooting & Self-Healing

This guide covers common edge cases, errors, and automated self-healing procedures for browser automation.

---

## 1. Extension Disconnect or Missing Socket

### Symptom:
`ECONNREFUSED` or `ENOENT` on `/tmp/antigravity-browser-bridge.sock` when invoking `mcp_antigravity_browser_*` tools.

### Cause:
The background daemon (`bridge-daemon.js`) was terminated or not started on host boot.

### Self-Healing:
The MCP server (`mcp-server.js`) includes an automatic supervisor `ensureDaemonRunning()`. However, if manually diagnosing:
```bash
# 1. Check daemon status
node /home/jayant/.gemini/antigravity/browser-bridge/cli.js status

# 2. If daemon not running, start it:
node /home/jayant/.gemini/antigravity/browser-bridge/bridge-daemon.js &
```

---

## 2. Hot-Reloading the Extension Without User Interaction

### Symptom:
You updated `manifest.json`, `background.js`, or content scripts and need Chrome to pick up the new version immediately without asking the user to open `chrome://extensions` and click refresh.

### Solution:
Call `browser_reload_extension` or run:
```bash
node /home/jayant/.gemini/antigravity/browser-bridge/cli.js reload-extension
```
Chrome will terminate the service worker, exit `host.js`, and immediately spawn a fresh `host.js` which connects to the daemon in under 300ms.

---

## 3. Stale Element References in Single-Page Apps (React / Vue)

### Symptom:
`Error: Target element not found` or action executed on an unmounted element after a state transition.

### Cause:
React / Vue re-renders the DOM tree asynchronously. The element snapshot acquired in the previous turn has been replaced by a new DOM node.

### Solution:
1. Always use semantic or role-based locators that resolve on lookup rather than cached DOM references.
2. In compound actions (`browser_run_actions`), insert an explicit `{ "type": "wait", "ms": 200 }` after clicks that trigger router navigations or modal transitions.
3. Fallback to `browser_find_and_click` with `{ "text": "Save", "tag": "button" }` which searches dynamically.

---

## 4. Canvas-Heavy Applications (Google Sheets, Figma, Miro)

### Symptom:
The accessibility tree or DOM only shows `<canvas>` with no child nodes for cells, shapes, or canvas controls.

### Cause:
Canvas graphics render into an immediate-mode pixel buffer. Normal DOM selectors (`td`, `input`, `.cell`) do not exist.

### Solution:
1. **Never attempt to pixel-click canvas coordinates for structured data entry.**
2. Switch immediately to the specialized **`browser-google-sheets`** skill.
3. Use keyboard shortcuts (e.g. `Ctrl+J` / `#t-name-box`) and the OS clipboard (`browser_paste`) to manipulate canvas states.
