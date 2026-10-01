# CDP and page evaluation boundaries

The extension internally uses CDP; browser_evaluate runs a JavaScript expression in the page. It does not forward arbitrary CDP commands and cannot replace download/network/device emulation tools. Raw CDP, console/network streams, viewport control and Playwright need separately configured, user-authorized tools. Report capability gaps instead of inventing bridge APIs.

Expressions must execute, not merely declare an arrow function:

```javascript
(() => Array.from(document.querySelectorAll('table tbody tr'), row => ({
  name: row.querySelector('.name')?.textContent?.trim() || '',
  status: row.querySelector('.status')?.textContent?.trim() || ''
})))()
```

Wait for a bounded page predicate with an invoked promise expression; include timeout and interval cleanup. Page evaluation can mutate the application, so its tab authorization checks apply. Read only the scoped data needed; do not dump cookies, localStorage, sessionStorage, credentials or authentication tokens.

The extension dismisses JavaScript dialogs by default. Do not assume it accepts confirmations or provides a dialog-accept command.

## See also

- [Browser skill](../SKILL.md)
- [Client capability limits](../../../agent-docs/servers/clients.md)
