# Chrome extension

Last updated: 2026-10-01.

Manifest V3 with worker `background.js`, injected `content-scripts/cursor.js`, and `popup.html`/`popup.js`. The public manifest key fixes extension ID `fkklpoodihheinpcjpldofbdbmabofcl`. Native host name is `com.google.antigravity.browser`. Permissions include tabs, debugger, scripting, native messaging, storage, identity + identity.email, clipboard, and all URL host access. Cookie-based identity guessing is removed.

Ownership is loaded from session storage before request dispatch. `agentOwnedTabs` grants interaction permission; `agentCreatedTabs` grants bulk cleanup eligibility. Claims do not make existing user tabs disposable. Old ownership records without creation provenance remain interactable but are retained on cleanup. Ownership is shared within the profile; it is not an isolated per-agent lease.

Requests with a target tab queue sequentially by tab ID. Batches preflight supported action names, one-tab scope, and wait/delay ranges. Different tabs can proceed independently. Debugger attaches are deduplicated, then Page/DOM/AX/Runtime domains and focus emulation are enabled. Another debugger's attachment is not silently claimed. JavaScript dialogs are dismissed.

Snapshots map session/generation-qualified UIDs to backend DOM nodes, include numeric AX values, and clear on navigation/detach. Mouse commands support coordinates or current UIDs; double-click emits two press/release pairs. Drag movement sets held-button flags. Keyboard shortcuts omit insertion text. Full-page screenshots use document bounds; PNG does not send JPEG quality.

Paste sends one DataTransfer event to the focused target. When not consumed, ordinary editable fields use native insertText. Unsupported canvas editors error. No system clipboard write is attempted; rich HTML handling and app-level application still require read-back.

Cursor overlay is injected only on owned tabs and is inert/aria-hidden. Motion frames stop when settled or hidden and resume on state updates. Popup reports the native port connection and attached debugger count, not daemon reachability. New tabs default to background; explicit activation may focus a window.

## See also

- [Status](../status/extension-status.md)
- [Automation gotchas](../gotchas/automation-accuracy.md)
- [Ownership gotchas](../gotchas/ownership-and-routing.md)
- [Native host](native-host.md)
- [Validation](../workflows/validation.md)
- [Decisions](../decisions.md)
