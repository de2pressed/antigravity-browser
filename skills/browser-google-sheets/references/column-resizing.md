# Google Sheets Column Auto-Fit & Layout Polish Reference

This guide provides deterministic, canvas-safe methods for auto-fitting columns, resizing specific columns, avoiding layout traps, and pinning frozen header rows.

---

## 1. The Core Column Auto-Fit Recipe

Google Sheets renders all new sheets with default 100px column widths. In automated workflows, text like AWS instance IDs, IP addresses, database engine versions, and operational metrics are instantly truncated unless columns are fitted to content.

### Deterministic 4-Step Auto-Fit Procedure

```javascript
// Step 1: Select target column range (e.g. columns A through N)
// Jump to A:N via the Name Box
await callDaemon("find_and_click", { tabId, selector: "#t-name-box" });
await callDaemon("type", { tabId, text: "A:N", pressEnter: true });

// Step 2: Open Resize dialog via Search the Menus (Alt+/)
await callDaemon("find_and_click", { tabId, selector: "input[placeholder='Menus']" });
await callDaemon("type", { tabId, text: "Resize columns", pressEnter: true });

// Step 3 & 4: Toggle JFK 'Fit to data' radio button and click OK
await callDaemon("evaluate", { tabId, expression: `(() => {
  const autoRadio = document.getElementById("waffle-resize-selection-auto-label")?.closest(".jfk-radiobutton");
  if (autoRadio) {
    ['mousedown', 'mouseup', 'click'].forEach(t => autoRadio.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
  }
  const okBtn = document.querySelector('button[name="ok"]');
  if (okBtn) {
    setTimeout(() => {
      ['mousedown', 'mouseup', 'click'].forEach(t => okBtn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
    }, 80);
    return { success: true };
  }
  return { error: "Dialog elements not found" };
})()` });
```

---

## 2. The "Footnote Width Trap" & How to Avoid It

> [!WARNING]
> **The Footnote Width Trap**:
> When a spreadsheet table has a long footnote at the bottom (e.g. in cell `A16`: *"Historical snapshot from Sep 15, 2026. Metrics as of 2026-09-15... (200 characters)"*), auto-fitting the entire range `A:N` will expand **Column A** to 800+ pixels wide! This pushes the actual table columns off-screen.

### The Correct Mitigation Strategy:
1. **Auto-Fit Data Columns Only**:
   - Select `B:N` (or whatever range excludes Column A).
   - Apply the "Fit to data" procedure above.
2. **Explicitly Set Column A Width**:
   - Select `A:A` via `#t-name-box`.
   - Open Resize dialog (`input[placeholder="Menus"]` -> `"Resize column"` -> `Enter`).
   - Select `#waffle-resize-selection-custom-label` and enter a snug fixed width (e.g. `120` or `130` pixels).
   - The footnote in cell `A16` will cleanly overflow horizontally across the empty row 16 without distorting the table layout.

### Code Recipe for Custom Width:
```javascript
await callDaemon("evaluate", { tabId, expression: `(() => {
  const customRadio = document.getElementById("waffle-resize-selection-custom-label")?.closest(".jfk-radiobutton");
  if (customRadio) {
    ['mousedown', 'mouseup', 'click'].forEach(t => customRadio.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
  }
  const input = document.getElementById("waffle-resize-input");
  if (input) {
    input.value = "120";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const okBtn = document.querySelector('button[name="ok"]');
  if (okBtn) {
    setTimeout(() => {
      ['mousedown', 'mouseup', 'click'].forEach(t => okBtn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
    }, 80);
    return { success: true };
  }
  return { error: "Failed to set custom width" };
})()` });
```

---

## 3. Freezing Header Rows

To keep the header pinned while scrolling:
1. Focus `input[placeholder="Menus"]`.
2. Type `"Freeze 1 row"` and press `Enter`.
3. Return cursor focus to `A1` via `#t-name-box`.

```bash
agy-browser fc <tabId> "input[placeholder='Menus']"
agy-browser type <tabId> "Freeze 1 row" --enter
agy-browser fc <tabId> "#t-name-box"
agy-browser type <tabId> "A1" --enter
```
