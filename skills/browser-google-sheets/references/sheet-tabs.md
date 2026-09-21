# Google Sheets Tab Management & Multi-Sheet Workbooks

Enterprise financial and operational models are structured across multiple tabs (e.g. `Executive Summary`, `Assumptions`, `P&L`, `Schedules`).

---

## 1. Sheet Tab Bar Architecture

The bottom tab bar of Google Sheets lives inside `#grid-bottom-bar`:
- **Add Sheet Button**: `div[aria-label="Add Sheet"]` or `.docs-sheet-add-button`.
- **Sheet Tabs List**: `div[role="tablist"]` containing `.docs-sheet-tab`.
- **Tab Title**: `.docs-sheet-tab-name`.

---

## 2. Managing Sheet Tabs

### A. Adding a New Sheet
```json
// Option 1: Click the add button
{
  "selector": "div[aria-label=\"Add Sheet\"]"
}

// Option 2: Keyboard shortcut
{
  "key": "F11",
  "modifiers": ["Shift"]
}
```

### B. Renaming an Active Sheet Tab
1. Right-click or double-click the active tab:
```javascript
// Via browser_evaluate:
(() => {
  const activeTab = document.querySelector('.docs-sheet-tab.docs-sheet-active-tab .docs-sheet-tab-name');
  if (!activeTab) return false;
  activeTab.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  return true;
})()
```
2. Type the new name and press `Enter`:
```json
{
  "actions": [
    { "type": "type", "text": "Financial Model" },
    { "type": "press_key", "key": "Enter" }
  ]
}
```

### C. Switching Between Tabs
1. Click the target tab directly by its accessible name:
```json
{
  "selector": ".docs-sheet-tab-name:has-text(\"Assumptions\")"
}
```
2. Or use keyboard shortcuts:
   - Next sheet: `Ctrl + Shift + PageDown` (or `Alt + DownArrow`)
   - Previous sheet: `Ctrl + Shift + PageUp` (or `Alt + UpArrow`)

---

## 3. Cross-Sheet Formula Syntax

When referencing cells across sheets in TSV payloads:
- Sheet names without spaces: `=Summary!B4 + Assumptions!C10`
- Sheet names with spaces or special characters (MUST be enclosed in single quotes):
  `='Executive Summary'!B4 * '2026 Forecast'!C12`
- Referencing ranges across sheets: `=SUM('P&L'!D5:D30)`
