# Validation, Auditing & Sanity Check Engineering

In critical decision models, an unverified formula can cost millions. Professional models include dedicated audit blocks and error gates that turn bright red if any constraint is violated.

---

## 1. The Balance Check (Assets = Liabilities + Equity)

Every Balance Sheet model must include an explicit Check Row:
```excel
=IF(ROUND(Total_Assets - (Total_Liabilities + Total_Equity), 2) = 0, "OK", "UNBALANCED: " & (Total_Assets - (Total_Liabilities + Total_Equity)))
```
*Note*: Always use `ROUND(..., 2)` to eliminate floating-point precision differences (e.g. `0.000000000004`).

---

## 2. Global Checksum Master Cell

In tab `Executive Summary` or `Audit`, aggregate all worksheet checks into a single master indicator cell `B2`:

```excel
=IF(COUNTIF('Audit'!C:C, "<>OK") = 0, "MODEL INTEGRITY: 100% VERIFIED", "WARNING: " & COUNTIF('Audit'!C:C, "<>OK") & " CHECKS FAILED")
```

### Conditional Formatting Rules for Master Cell:
- If cell equals `"MODEL INTEGRITY: 100% VERIFIED"`: Background `#E6F4EA` (Soft Green), Font `#137333` (Dark Green Bold).
- If cell contains `"WARNING"`: Background `#FCE8E6` (Soft Red), Font `#C5221F` (Dark Red Bold).

---

## 3. Checklist of Institutional Audit Checks

Implement these tests on the dedicated `Audit` tab:

1. **Total Cash Consistency**: Does Ending Cash on the Cash Flow Statement equal Cash on the Balance Sheet?
   `=ROUND('Cash Flow'!D40 - 'Balance Sheet'!D8, 2) == 0`
2. **Depreciation Roll-Forward**: Does Ending Accumulated Depreciation equal Beginning + Depreciation Expense - Disposals?
3. **Headcount vs Payroll**: Does Headcount in Dept Schedules multiply correctly by Average Salary bands?
4. **Percentage Allocations**: Do expense category allocation weights sum to exactly `100.0%`?
   `=ROUND(SUM(C10:C18), 4) == 1.0000`
5. **Zero Error Values**: Count of any error cells (`#REF!`, `#DIV/0!`, `#N/A`, `#VALUE!`):
   `=COUNTIF(Range, "#N/A") + COUNTIF(Range, "#REF!")`
