---
name: browser-control
description: Use the Antigravity Browser Bridge for browser navigation, snapshots, clicks, typing, paste, and sequential batches with explicit profile/tab targeting and outcome verification.
---

# Browser control

## Preflight and routing

Read the workspace's operating rules first, then the bridge [current status](../../agent-docs/status/global.md). Inspect available MCP schemas or `agy-browser --help`; bridge tool names may have a client prefix. For CLI read [agent-browser](../agent-browser/SKILL.md); for Sheets read [browser-google-sheets](../browser-google-sheets/SKILL.md) plus [spreadsheets-mastery](../spreadsheets-mastery/SKILL.md) for modeling/design. [Playwright guidance](../playwright-interactive/SKILL.md) requires a separate configured environment; it is not a bridge capability.

1. Inspect connected profiles (`agy-browser status`) and current tabs (`agy-browser tabs`). A website account and browser profile identity are different; verify both when relevant.
2. Create a background tab with an exact connected profile, or claim an existing tab only when the user authorized that page/task. Never borrow idle user tabs or infer authorization from agentOwned=true.
3. Record IDs created for this task. Ownership is profile-wide across agents; close only those IDs afterward. Avoid `cleanup`/close_agent_tabs during shared-agent work.
4. Read snapshot/screenshot and choose the current UID or precise CSS selector. UID generations change across snapshots and worker lifecycles.
5. Run deterministic single-tab steps, then read back application state. Inspect before retrying an uncertain mutation or taking an irreversible dependent step.

## Locators and actions

`selector` accepts standard CSS through document.querySelectorAll, such as `[data-testid="save"]` or `button[aria-label="Save"]`. Playwright's `:has-text` and invented `[name="Save"]` accessibility predicates are not bridge CSS. For accessible text/role use:

```json
{"tabId":123,"text":"Save","role":"button"}
```

Use current snapshot UIDs for click/hover/drag/type. Semantic locators are top-document oriented; shadow roots, iframes, duplicate/occluded controls and canvas grids may need separate verified targeting.

```json
{"tabId":123,"actions":[{"type":"click","selector":"#search"},{"type":"type","text":"query","clear":true},{"type":"press_key","key":"Enter"}]}
```

Batches reduce client round trips but make no latency guarantee. They target one tab, execute sequentially, and are not transactional; errors identify completed action count. type uses Input.insertText, not human per-character keystrokes. Modified press_key handles shortcuts. Paste uses one event plus native text fallback for editable fields; rich editors must accept it. Verify actual values/save state/formatting after paste. No foreground-speed timer guarantee follows from focus emulation.

The tool surface is tab management, snapshot, click/hover/drag, type/key/paste/scroll, evaluate, screenshot, batch, and recording. The bridge does not expose arbitrary CDP, console/network-event streams, download interception, viewport control, or Playwright transport. Do not silently switch tools/session when something is missing. JavaScript dialogs are dismissed; do not rely on automatic acceptance.

Timeout or disconnect can leave work executing; inspect state before retrying. Existing user authorization applies to external actions; browser/tool access alone is not authorization to send messages or publish changes. Do not export cookies/tokens or dump session storage.

## See also

- [CLI commands](../agent-browser/SKILL.md)
- [Tab safety](references/tab-claiming.md)
- [CDP/evaluation limits](references/cdp-capabilities.md)
- [Accessibility](references/accessibility.md)
- [File uploads](references/file-uploads.md)
- [Troubleshooting](references/troubleshooting.md)
- [Global Antigravity route](../../integration/antigravity-global.md)
