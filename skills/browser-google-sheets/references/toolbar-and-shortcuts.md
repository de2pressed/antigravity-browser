# Google Sheets Toolbar Selectors & Keyboard Shortcuts

This reference provides exact DOM selectors and keyboard shortcuts for controlling Google Sheets formatting and UI actions.

---

## 1. Top Keyboard Shortcuts

Google Sheets supports a rich set of native keyboard shortcuts on Linux/Windows:

| Action | Shortcut | Usage Note |
|---|---|---|
| Focus Name Box | `Ctrl + J` | Jump to range |
| Edit Active Cell | `F2` | Enters formula edit mode |
| Bold Selection | `Ctrl + B` | Bolds text in active cell or range |
| Italicize Selection | `Ctrl + I` | Italicizes text in active cell or range |
| Underline Selection | `Ctrl + U` | Underlines text |
| Select Entire Sheet | `Ctrl + A` | Selects all cells |
| Undo | `Ctrl + Z` | Reverts last operation |
| Redo | `Ctrl + Y` | Reapplies last operation |
| Insert Current Date | `Ctrl + ;` | Inserts static current date |
| Insert Current Time | `Ctrl + Shift + ;` | Inserts static current time |
| Insert Hyperlink | `Ctrl + K` | Opens link insertion modal |
| Fill Down | `Ctrl + D` | Copies top row formulas downward |
| Fill Right | `Ctrl + R` | Copies left column formulas rightward |
| Hide Column | `Ctrl + Alt + 0` | Hides selected column |
| Hide Row | `Ctrl + Alt + 9` | Hides selected row |
| Add New Sheet | `Shift + F11` | Creates new worksheet tab |

---

## 2. Toolbar DOM Selectors

Google Sheets toolbar buttons use reliable `aria-label` attributes:

```css
/* Formatting buttons */
button[aria-label*="Bold (Ctrl+B)"],
div[aria-label*="Bold (Ctrl+B)"]

button[aria-label*="Italic (Ctrl+I)"],
div[aria-label*="Italic (Ctrl+I)"]

button[aria-label*="Underline (Ctrl+U)"],
div[aria-label*="Underline (Ctrl+U)"]

/* Colors */
div[aria-label*="Text color"]
div[aria-label*="Fill color"]

/* Borders & Alignment */
div[aria-label*="Borders"]
div[aria-label*="Horizontal align"]
div[aria-label*="Vertical align"]
div[aria-label*="Text wrapping"]

/* Number Formatting */
div[aria-label*="Format as currency"]
div[aria-label*="Format as percent"]
div[aria-label*="Decrease decimal places"]
div[aria-label*="Increase decimal places"]
div[aria-label*="More formats"]

/* Merge Cells */
div[aria-label*="Merge cells"]
```

---

## 3. Handling Modals & Menus

- To access top menus via keyboard shortcuts on Chrome:
  - `Alt + F`: File menu
  - `Alt + E`: Edit menu
  - `Alt + V`: View menu
  - `Alt + I`: Insert menu
  - `Alt + O`: Format menu
  - `Alt + D`: Data menu
  - `Alt + T`: Tools menu
- In `browser_find_and_click`, you can target dropdown items directly:
```json
{
  "text": "Alternating colors",
  "tag": "span"
}
```
This is the fastest way to apply professional banded row formatting.
