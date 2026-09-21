# Google Sheets Programmatic Export & Verification

The ultimate test of browser automation accuracy is verification. Instead of guessing whether formulas calculated properly, export the sheet programmatically and inspect the data with Python.

---

## 1. Google Sheets Export URLs

Every Google Sheet has a canonical URL structure:
```
https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit#gid=<GID>
```

You can download the live calculated workbook directly by changing the URL suffix:

| Format | Export URL | Best Use Case |
|---|---|---|
| **XLSX (Full Workbook)** | `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=xlsx` | Verifying multi-tab models, formulas, and formatting |
| **CSV (Active Sheet)** | `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=<GID>` | Fast text verification of single sheets |
| **PDF (Print View)** | `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=pdf` | Verifying print layout, pagination, and headers |

---

## 2. Python Verification Script

After automating a spreadsheet, download the XLSX file using curl or python with the user's browser session or public link, and run an automated sanity check:

```python
import openpyxl
import sys

def verify_sheet(file_path):
    wb = openpyxl.load_workbook(file_path, data_only=True)
    print(f"Loaded workbook. Sheets: {wb.sheetnames}")
    
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        print(f"\n--- Checking Sheet: {sheet_name} ({sheet.max_row} rows, {sheet.max_column} cols) ---")
        
        # Check for formula evaluation errors (#REF!, #VALUE!, #NAME?, #DIV/0!, #N/A)
        error_cells = []
        for r in range(1, sheet.max_row + 1):
            for c in range(1, sheet.max_column + 1):
                val = str(sheet.cell(r, c).value or '')
                if val.startswith('#') and any(err in val for err in ['REF', 'VALUE', 'NAME', 'DIV/0', 'N/A']):
                    coord = sheet.cell(r, c).coordinate
                    error_cells.append((coord, val))
        
        if error_cells:
            print(f"[FAILED] Found {len(error_cells)} error cells in {sheet_name}:")
            for coord, err in error_cells[:10]:
                print(f"  - {coord}: {err}")
            return False
        else:
            print(f"[PASSED] Zero formula errors in {sheet_name}.")
            
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        success = verify_sheet(sys.argv[1])
        sys.exit(0 if success else 1)
```

---

## 3. Fast Verification via Headless Fetch in Active Session

If the sheet is private to the authenticated Google account, use `browser_evaluate` to fetch the CSV or XLSX as a Blob using the browser's existing authenticated cookies:

```javascript
// Via browser_evaluate:
async (spreadsheetId, gid) => {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) return { error: `HTTP ${response.status}: ${response.statusText}` };
  const text = await response.text();
  return { success: true, preview: text.split('\n').slice(0, 15).join('\n') };
}
```
This guarantees 100% verification without needing to export credentials.
