# Bulk TSV & HTML Data Ingestion Reference

Typing data cell-by-cell using `browser_type` followed by arrow keys or `Enter` is slow, error-prone, and burns tokens. **Dual TSV + HTML clipboard injection is 100x faster, 100% deterministic, and applies full executive formatting (colors, badges, bold headers, borders) in a single turn.**

---

## 1. How Google Sheets Parses Clipboard TSV & HTML

When text is pasted into an active cell in Google Sheets:
- `\t` (horizontal tab, ASCII `0x09`) moves to the next column on the right.
- `\n` (newline, ASCII `0x0A`) moves to the first column of the next row down.
- Strings starting with `=` are automatically evaluated as live spreadsheet formulas.
- Numbers are automatically recognized as numeric types for calculation and aggregation.
- **When HTML table markup (`text/html`) is provided alongside `text/plain`**, Google Sheets natively parses inline CSS styles:
  - Header background colors (`background-color: #1a365d; color: #ffffff; font-weight: bold;`)
  - Status/environment badges (`background-color: #d1e7dd; color: #0f5132;`)
  - Numeric alignments (`text-align: right;`)
  - Monospace code fonts (`font-family: monospace;`)
  - Cell borders (`border: 1px solid #cbd5e1;`)

---

## 2. Formatting Guidelines for TSV & HTML Payloads

### A. Escaping Rules
- If a text cell contains a tab or newline, wrap that cell value in double quotes: `"Line 1\nLine 2"`.
- To include a literal double quote inside quotes, escape it as two double quotes: `"He said ""Hello"""`.
- Formulas must NOT be wrapped in quotes if you want them to calculate: `=SUM(B2:B10)` (NOT `"=SUM(B2:B10)"`).

### B. Python Script to Generate Dual TSV + HTML Payload
```python
import csv
import io
import html

headers = ["Environment", "Service", "Status", "vCPU", "Memory (GiB)"]
rows = [
    ["PROD", "API Gateway", "running", 8, 16],
    ["PROD", "Auth Service", "running", 4, 8],
    ["QA", "Test Worker", "stopped", 2, 4],
]

# 1. Generate Plain TSV
output = io.StringIO()
writer = csv.writer(output, delimiter='\t', lineterminator='\n', quoting=csv.QUOTE_MINIMAL)
writer.writerow(headers)
for row in rows:
    writer.writerow(row)
tsv_payload = output.getvalue()

# 2. Generate Formatted HTML Table
html_parts = ['<table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt;"><thead><tr>']
for idx, h in enumerate(headers):
    align = "right" if idx in (3, 4) else "left"
    html_parts.append(f'<th style="background-color: #1a365d; color: #ffffff; font-weight: bold; text-align: {align}; padding: 8px 10px; border: 1px solid #334155;">{html.escape(h)}</th>')
html_parts.append('</tr></thead><tbody>')

for r_idx, row in enumerate(rows):
    bg = "#ffffff" if r_idx % 2 == 0 else "#f8fafc"
    html_parts.append('<tr>')
    for c_idx, val in enumerate(row):
        style = f'background-color: {bg}; padding: 6px 10px; border: 1px solid #cbd5e1;'
        if c_idx == 0:  # Environment badge
            style += ' background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center;' if val == "PROD" else ' background-color: #d1fae5; color: #065f46; font-weight: bold; text-align: center;'
        elif c_idx == 2:  # Status
            style += ' background-color: #d1e7dd; color: #0f5132; font-weight: bold; text-align: center;' if val == "running" else ' background-color: #f8d7da; color: #842029; font-weight: bold; text-align: center;'
        elif c_idx in (3, 4):  # Numbers
            style += ' text-align: right;'
        html_parts.append(f'<td style="{style}">{html.escape(str(val))}</td>')
    html_parts.append('</tr>')
html_parts.append('</tbody></table>')
html_payload = "".join(html_parts)
```

---

## 3. Atomic Dispatch Workflow

### Via CLI:
```bash
agy-browser fc <tabId> "#t-name-box"
agy-browser type <tabId> "A1" --enter
agy-browser paste <tabId> "$tsv_payload" --html "$html_payload"
```

### Via MCP:
```json
{
  "tabId": 459840420,
  "text": "<tsv_payload>",
  "html": "<html_payload>"
}
```

In a single operation, data, formulas, and visual formatting are injected simultaneously.
