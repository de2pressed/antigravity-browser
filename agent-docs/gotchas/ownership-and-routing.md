# P1: Ownership and profile routing

Last updated: 2026-10-01.

An unknown profile or missing tab ID formerly fell back to the first profile. This could dispatch a mutation to the wrong account. Routing now errors on absent/ambiguous targets. Always list profiles/tabs first and use the exact observed identity/ID. When multiple profiles connect, `new_tab` requires a profile.

Chrome profile identity is not the site's active account. The prior code guessed from page titles/cookies because identity.email was missing. That guessing was removed and the permission added; legacy cached identities without provenance are ignored. Unknown remains unknown. Never choose an authenticated work account from a page title alone.

A claim formerly made a user tab eligible for cleanup. Created-tab provenance is now separate; cleanup retains claimed user tabs and legacy ownership records. However, created tabs remain shared across bridge clients. During multi-client work, close only your recorded scratch IDs, not all created tabs. Persistent session ownership can reset on extension/browser reload; inspect ownership after lifecycle changes.

## See also

- [Daemon](../servers/daemon.md)
- [Extension](../servers/extension.md)
- [Validation](../workflows/validation.md)
- [Decisions](../decisions.md)
