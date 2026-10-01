# Snapshot UID lifecycle

The extension retrieves Chrome's accessibility tree and assigns each retained node a handle `uid=<tabId>_<generation>_<index>`. It stores the backend DOM node ID with that handle. These are not CSS selectors, Playwright locators, or `e1` aliases.

A new snapshot replaces the tab's mapping and uses a new generation, so an old UID cannot silently resolve to a different element. Navigation/loading and debugger detachment clear the mapping. DOM changes within a page may remove the underlying node; take another snapshot after forms, modal changes, or list updates.

```bash
agy-browser snap <tabId>
agy-browser click <tabId> <uid-from-that-snapshot>
```

Informational accessibility nodes can appear without a backing DOM element. Such nodes cannot necessarily be clicked. Use a visible actionable node, a precise selector through `fc`, or explicit coordinates after checking the current page.

## See also

- [CLI usage](../SKILL.md)
- [Semantic locators](semantic-locators.md)
