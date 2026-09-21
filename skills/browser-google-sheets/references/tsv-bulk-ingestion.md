# Bulk TSV Data & Formula Ingestion Reference

Typing data cell-by-cell using `browser_type` followed by arrow keys or `Enter` is slow, error-prone, and burns tokens. **Tab-Separated Values (TSV) clipboard injection is 50x to 100x faster and 100% deterministic.**

---

## 1. How Google Sheets Parses Clipboard TSV

When Tab-delimited text is pasted into an active cell in Google Sheets:
- `\t` (horizontal tab, ASCII `0x09`) moves to the next column on the right.
- `\n` (newline, ASCII `0x0A`) moves to the first column of the next row down.
- Strings starting with `=` are automatically evaluated as live spreadsheet formulas.
- Numbers are automatically recognized as numeric types for calculation and aggregation.

---

## 2. Formatting Guidelines for TSV Payloads

### A. Escaping Rules
- If a text cell contains a tab or newline, wrap that cell value in double quotes: `"Line 1\nLine 2"`.
- To include a literal double quote inside quotes, escape it as two double quotes: `"He said ""Hello"""`.
- Formulas must NOT be wrapped in quotes if you want them to calculate: `=SUM(B2:B10)` (NOT `"=SUM(B2:B10)"`).

### B. Example Financial Model Payload
```tsv
Metric	2024 Actual	2025 Budget	2026 Forecast	YoY Growth
Revenue	$1,250,000	$1,550,000	$1,920,000	=(D2-C2)/C2
COGS	$450,000	$520,000	$610,000	=(D3-C3)/C3
Gross Profit	=B2-B3	=C2-C3	=D2-D3	=(D4-C4)/C4
Gross Margin	=B4/B2	=C4/C2	=D4/D2	=D5-C5
Operating Expenses	$350,000	$410,000	$480,000	=(D6-C6)/C6
EBITDA	=B4-B6	=C4-C6	=D4-D6	=(D7-C7)/C7
```

### C. Python Script to Generate TSV String
```python
import csv
import io

data = [
    ["Metric", "2024 Actual", "2025 Budget", "2026 Forecast", "YoY Growth"],
    ["Revenue", 1250000, 1550000, 1920000, "=(D2-C2)/C2"],
    ["COGS", 450000, 520000, 610000, "=(D3-C3)/C3"],
    ["Gross Profit", "=B2-B3", "=C2-C3", "=D2-D3", "=(D4-C4)/C4"],
    ["Gross Margin", "=B4/B2", "=C4/C2", "=D4/D2", "=D5-C5"],
    ["Operating Expenses", 350000, 410000, 480000, "=(D6-C6)/C6"],
    ["EBITDA", "=B4-B6", "=C4-C6", "=D4-D6", "=(D7-C7)/C7"],
]

output = io.StringIO()
writer = csv.writer(output, delimiter='\t', lineterminator='\n', quoting=csv.QUOTE_MINIMAL)
for row in data:
    writer.writerow(row)
tsv_payload = output.getvalue()
print(tsv_payload)
```

---

## 3. Atomic Dispatch Workflow

1. Select top-left anchor cell (e.g. `A1`) via `#t-name-box`.
2. Send `browser_paste` with `{ "text": tsv_payload }`.
3. Done! The entire dataset and formula network is created in a single turn.
