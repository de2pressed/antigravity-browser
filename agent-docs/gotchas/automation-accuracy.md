# P2: Automation result accuracy

Last updated: 2026-10-01.

Snapshot UIDs are generation-qualified, and navigation clears the map. Earlier code reused `<tabId>_<index>` so an old UID could resolve to a different node after a new snapshot. Use the latest snapshot after page changes; AX-only informational nodes may not have a clickable DOM box. DOM changes within a page can still make a UID stale.

Paste previously skipped native insertion on normal inputs, dispatched two paste paths on rich editors, and returned success even when the event/clipboard failed. Current paste uses one event with native insertText fallback for editable fields. A consumed event means an application handler accepted it, not that Sheets saved all cells. Read back values/formulas and counts. Rich HTML may be ignored by the target; appliedHtml indicates event consumption, not verified formatting.

Navigation timeout formerly resolved as successful load. It now rejects; fast complete checks subscribe before reading state. Client timeouts/disconnects still cannot cancel an in-flight browser mutation. Inspect outcome before retrying. Batches are not transactional; an error includes the completed action count.

Locator filters combine selector/text/role, skip hidden/disabled nodes, and prefer exact text/leaf matches. Duplicate visible controls still need a more specific selector. Shadow DOM, cross-origin iframes, and canvas locations are not universal semantic locator support. Dialogs are dismissed; do not depend on automatic confirmation.

## See also

- [Extension](../servers/extension.md)
- [Clients](../servers/clients.md)
- [Validation](../workflows/validation.md)
