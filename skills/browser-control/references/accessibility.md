# Accessibility & Semantic Locator Engineering

This reference details how to extract, parse, and target accessibility nodes in complex web applications.

---

## 1. Why Accessibility First?

DOM structure changes frequently across framework updates, CSS refactors, and minification runs. In contrast, accessibility trees (`role`, `aria-label`, `accessible name`, and `accessible value`) are tied directly to user intent and screen reader contracts. They are:
- **Resilient**: Class names and DOM depth can change without breaking accessibility semantics.
- **Unambiguous**: Screen readers require clear naming; if an accessible name exists, it uniquely identifies the control.
- **Standardized**: Follows W3C WAI-ARIA 1.2 standards across all browsers.

---

## 2. Standard Role Hierarchies & Locators

### A. Buttons & Triggers
```css
/* Direct ARIA button with specific label */
button[aria-label="Close dialog"],
[role="button"][aria-label="Close dialog"]

/* Button containing specific visible text */
button:has-text("Save Changes")

/* Icon button with tooltip or aria-label */
button[aria-label*="Search" i]
```

### B. Form Inputs & Text Fields
```css
/* Inputs with accessible labels */
input[aria-label="Search repositories"]
textarea[aria-label="Issue description"]

/* Associated label resolution */
label:has-text("Email Address") + input,
input#email
```

### C. Dropdowns & Selection Lists
```css
/* Combobox pattern */
[role="combobox"][aria-expanded="false"]

/* Active option in listbox */
[role="listbox"] [role="option"][aria-selected="true"]

/* Native select */
select[name="environment"]
```

### D. Navigation, Tabs & Menus
```css
/* Tab navigation */
[role="tablist"] [role="tab"][aria-selected="true"]

/* Dropdown menu items */
[role="menu"] [role="menuitem"]:has-text("Export as CSV")
```

---

## 3. Resolving Dynamic Accessibility States

Modern web applications communicate state through ARIA attributes:

| State | CSS Attribute Selector | Meaning | Action Pattern |
|---|---|---|---|
| Expanded | `[aria-expanded="false"]` | Collapsed accordion/dropdown | Click to expand |
| Disabled | `[aria-disabled="true"]`, `:disabled` | Control inactive | Wait or resolve prerequisite |
| Selected | `[aria-selected="false"]` | Unselected tab/option | Click to activate tab |
| Checked | `[aria-checked="true"]` | Checkbox toggled | Inspect before toggling |
| Busy | `[aria-busy="true"]` | Loading / async fetch | Wait until attribute is removed |

---

## 4. Handling Shadow DOM & Web Components

Many modern web apps (Salesforce, Lit, Google web apps) encapsulate UI inside shadow roots:
1. In `browser_evaluate`, query through shadow roots using recursive traversal:
```javascript
function queryShadow(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      const found = queryShadow(selector, child.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}
```
2. When dispatching clicks into shadow DOM elements, retrieve their `getBoundingClientRect()` and dispatch click via coordinates `(x, y)`.
