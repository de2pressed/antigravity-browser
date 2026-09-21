# Semantic Locators in Modern Single-Page Applications

Modern SPAs built with Tailwind CSS, styled-components, Emotion, or CSS Modules generate dynamic, obfuscated class names like `.css-1r8z2p` or `._header_12n4g_5`. Automation based on these classes breaks whenever the code is recompiled.

This guide outlines robust strategies for locating elements in modern SPAs.

---

## 1. Prioritized Locator Hierarchy

Always query in this strict priority order:

1. **User-Facing Accessible Role + Name**:
   - `getByRole('button', { name: 'Submit Order' })`
   - In CSS: `button:has-text("Submit Order")`, `[role="button"][aria-label="Submit Order"]`
   - *Why*: Immune to DOM refactors; directly mirrors human perception.

2. **Dedicated Test Attributes**:
   - `[data-testid="checkout-submit-btn"]`
   - `[data-test="login-input"]`
   - `[data-cy="nav-settings"]`
   - *Why*: Intentionally maintained by developers for automated testing.

3. **Placeholder & Form Labels**:
   - `input[placeholder="name@company.com"]`
   - `label:has-text("Work Email") + input`

4. **Hierarchical Semantic Scope**:
   - Find element within an explicit semantic parent:
     `nav:has-text("Main Navigation") >> a:has-text("Pricing")`
     `dialog[aria-labelledby="confirm-modal-title"] >> button:has-text("Confirm")`

---

## 2. Dealing with Tailwind & Class Name Soup

Tailwind creates long class lists: `<button class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">`.

**Never target these classes!**
- ❌ Bad: `button.bg-indigo-600.hover\:bg-indigo-700` (breaks if color theme or hover state changes).
- ✅ Good: `button:has-text("Save Draft")` or `form[name="post"] button[type="submit"]`.

---

## 3. Dynamic Text & RegEx Locators

When text includes dynamic numbers (e.g. `Inbox (14)`):
- In `browser_evaluate`:
  ```javascript
  Array.from(document.querySelectorAll('a, button')).find(el => /^Inbox\s*\(\d+\)$/.test(el.innerText.trim()))
  ```
- In CSS: `a[aria-label*="Inbox" i]`
