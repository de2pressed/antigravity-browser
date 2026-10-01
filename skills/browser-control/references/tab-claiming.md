# Tab claiming and isolation

List tabs and profiles first. agentOwned means created OR claimed by any bridge client; it does not mean this agent created the tab. agentCreated is cleanup provenance, also shared across agents. Neither flag grants task authorization.

Create a dedicated background tab with an exact connected profile unless the user authorized using an existing page. In that case use browser_claim_tab or `agy-browser claim <tabId>`. Do not claim unrelated pages or idle user tabs. Activate/focus only if requested; activation is not claiming.

Keep a task-local list of new IDs. Close each recorded scratch ID using browser_close_tab or `agy-browser close <tabId>`. Claimed user tabs should remain open. Bulk cleanup retains claimed tabs but can close other agents' created tabs, so avoid it during shared work. Reloads can reset ownership/provenance; inspect again rather than assuming persistence.

Browser profile identity is distinct from the website login/account. Reject mismatches or ambiguity instead of guessing. Multiple profiles require selection for new tabs; missing/colliding tab IDs fail explicitly.

## See also

- [Browser skill](../SKILL.md)
- [Project routing gotchas](../../../agent-docs/gotchas/ownership-and-routing.md)
