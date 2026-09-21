# Google Sheets Canvas Architecture vs DOM

Understanding why traditional web automation fails on Google Sheets is critical for robust execution.

---

## 1. The Rendering Engine

Google Sheets uses a custom hardware-accelerated 2D canvas rendering engine:
- **Canvas Viewport**: An HTML5 `<canvas id="grid-canvas">` receives layout paint commands from a WebAssembly/JavaScript core. The text, borders, cell backgrounds, and gridlines are drawn directly into a pixel buffer.
- **No DOM Nodes for Cells**: There are no `<td>`, `<tr>`, or `<div>` elements representing cell `C4`. A DOM query like `document.querySelector('td:contains("Revenue")')` will return `null`.
- **Virtual Input Overlay**: When a cell is focused, a single hidden `<textarea class="cell-input">` or content-editable layer is positioned over the active cell to capture keyboard input. It does not represent the grid.

---

## 2. Why Pixel Clicking Fails

Trying to click cells by calculating `(x, y)` pixel offsets from the screen edge is fragile:
1. **Dynamic Column Widths & Row Heights**: If any column has been resized or rows auto-expanded, coordinate math fails immediately.
2. **Scroll Offsets**: The canvas renders only visible cells (virtual windowing). If the sheet is scrolled horizontally or vertically, pixel coordinates map to completely different cells.
3. **Frozen Panes**: Sheets with frozen headers split the canvas into multiple rendering regions. Clicking across frozen boundaries throws coordinates off by tens or hundreds of pixels.
4. **Zoom & Device Pixel Ratio**: Browser zoom levels (`Ctrl +`) change canvas scaling ratios unpredictably.

---

## 3. The Accessible Anchor Points

The outer frame of Google Sheets *is* rendered in standard HTML DOM. These accessible elements provide 100% deterministic control:

1. **The Name Box (`#t-name-box`)**:
   - Holds the reference of the currently selected cell or range (e.g. `A1`).
   - Clicking it or pressing `Ctrl+J` opens an input where typing any valid range (`B2:F20`) and pressing `Enter` moves the canvas focus accurately.

2. **The Formula Bar (`.cell-input` / `#formula-bar`)**:
   - Displays the formula or literal text of the active cell.
   - Allows reading or editing the formula directly.

3. **The Top Action Toolbar (`#docs-toolbar`)**:
   - Contains standard DOM buttons with full `aria-label` attributes (`Bold (Ctrl+B)`, `Italic (Ctrl+I)`, `Fill color`, `Borders`, `Merge cells`, `Format as currency`).

4. **The Sheet Tab Bar (`#grid-bottom-bar`)**:
   - Contains DOM tabs for each sheet in the workbook (`Sheet1`, `Sheet2`, etc.) and the "Add Sheet" button (`+`).
