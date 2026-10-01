---
name: agent-browser
description: CLI browser automation using the Antigravity Browser Bridge, exact tab IDs, accessibility UIDs, and sequential action batches.
---

# Agent Browser

Use `agy-browser --help` as the implemented CLI contract. The bridge uses an existing Chrome extension/native host connection. Playwright, console-event capture, network interception, and viewport emulation are separate tools, not CLI features.

## Commands

| Task | Command |
|---|---|
| Connected profiles | `agy-browser status` |
| Find tabs | `agy-browser tabs [--profile <substring>] [--search <query>]` |
| Create background tab | `agy-browser new --profile <email> <url>` |
| Claim a user-authorized tab | `agy-browser claim <tabId>` |
| Activate a tab | `agy-browser activate <tabId> [--bring-to-front]` |
| Navigate | `agy-browser navigate <tabId> <url>` |
| Snapshot | `agy-browser snap <tabId>` |
| Click a snapshot UID | `agy-browser click <tabId> <uid>` |
| Click a CSS selector | `agy-browser fc <tabId> <selector>` |
| Type | `agy-browser type <tabId> <text> [--uid <uid>] [--clear] [--enter]` |
| Paste | `agy-browser paste <tabId> <text> [--html <markup>]` |
| Key | `agy-browser press-key <tabId> Enter [--ctrl] [--alt] [--shift] [--meta]` |
| Scroll | `agy-browser scroll <tabId> --distance 500 [--up]` |
| Screenshot | `agy-browser screenshot <tabId> -o /tmp/page.jpg` |
| Batch | `agy-browser batch <tabId> '[{"type":"click","selector":"#submit"}]'` |
| Recording | `agy-browser record <tabId> '<actionsJson>' -o /tmp/workflow.mp4` |
| Close one tab | `agy-browser close <tabId>` |
| Close created scratch tabs | `agy-browser cleanup` |
| Reload extension | `agy-browser reload-extension` |

## Safety and accuracy

Specify a connected profile when more than one is available. A browser profile email is distinct from the account currently authenticated on a website. Verify both when account identity matters.

Only claim an existing tab when the user authorized interacting with that tab. Bulk cleanup retains claimed user tabs and closes created tabs. Ownership is shared by extension clients within a profile, rather than isolated per agent session; avoid bulk cleanup when another client may be using scratch tabs.

Snapshots use `uid=<tabId>_<generation>_<index>`, not `e1` aliases. A new snapshot replaces the previous mapping; navigation clears it. After a significant page change, take another snapshot before using UIDs.

A batch targets one tab. Failures are partial and identify the completed count. A timeout does not cancel browser work: inspect the outcome before retrying. Paste success requires read-back in the application, especially for Sheets or rich HTML.

## See also

- [UID lifecycle](references/ref-lifecycle.md)
- [Semantic locators](references/semantic-locators.md)
- [Dev server verification](references/dev-server-verification.md)
