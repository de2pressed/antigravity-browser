# Name Box Recipes & Advanced Selection Patterns

The Name Box (`#t-name-box`) is the universal steering wheel for Google Sheets. Mastering its syntax enables lightning-fast navigation.

---

## 1. Triggering the Name Box

### Approach A: Compound Action (Recommended)
```json
{
  "actions": [
    { "type": "click", "selector": "#t-name-box" },
    { "type": "type", "text": "A1:G1" },
    { "type": "press_key", "key": "Enter" }
  ]
}
```

### Approach B: Keyboard Shortcut
From anywhere within the active sheet, dispatch `Ctrl+J` (or `F5`):
- `Ctrl+J` instantly moves focus to the Name Box text field.
- Type target range -> press `Enter`.

---

## 2. Supported Range Syntax Recipes

| Selection Target | Syntax in Name Box | Result |
|---|---|---|
| Single Cell | `C5` | Moves active cursor to cell C5 |
| Contiguous Range | `B2:F20` | Highlights rectangular block from B2 to F20 |
| Entire Column | `D:D` | Selects entire column D (useful for applying column-wide formatting) |
| Multiple Columns | `B:E` | Selects columns B through E |
| Entire Row | `5:5` | Selects row 5 across all columns |
| Multiple Rows | `1:3` | Selects rows 1 through 3 |
| Disjoint Ranges | `A1:B10, D1:E10` | Selects both blocks simultaneously |
| Cross-Sheet Range | `Sheet2!A1:C10` | Switches to Sheet2 and highlights A1:C10 |
| Entire Sheet | `A:Z` or press `Ctrl+A` | Selects all cells in current worksheet |

---

## 3. Post-Selection Automation Patterns

Once a range is selected via the Name Box, immediate actions can be executed:
- **Bulk Delete**: Send `browser_press_key` with `{ "key": "Delete" }` to clear all content in the range.
- **Bulk Bold**: Send `Ctrl+B` to bold all text in the range.
- **Bulk Alignment**: Click toolbar alignment dropdown to center or right-align numbers.
- **Bulk Fill**: Open Fill Color picker to apply header background styling.
