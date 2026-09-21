# Formula Patterns, Dynamic Arrays & Edge Cases

High-performance spreadsheets minimize maintenance overhead by using robust, self-healing formula patterns.

---

## 1. Growth & Run-Rate Formulas

### Compound Annual Growth Rate (CAGR)
```excel
=((End_Value / Start_Value) ^ (1 / Number_of_Years)) - 1
```

### Period-over-Period Growth with Zero/Negative Handling
Standard percentage growth `(B - A) / A` breaks when base period `A` is zero or negative.
Use:
```excel
=IF(A2=0, IF(B2>0, 1, 0), (B2 - A2) / ABS(A2))
```

---

## 2. Dynamic Date Sequences & Aging

### Monthly End-of-Month Waterfall
```excel
=EOMONTH(StartDate, 0)
=EOMONTH(PreviousCell, 1)
```

### Dynamic Fiscal Quarter Formatter
Given a date in `B2`:
```excel
="Q" & INT((MONTH(B2)-1)/3)+1 & " " & YEAR(B2)
```

---

## 3. Dynamic Array Patterns (Google Sheets & Modern Excel)

### A. Unique Filtered Lists
Extract a sorted, deduplicated list of active customers:
```excel
=SORT(UNIQUE(FILTER(Customers!A2:A, Customers!B2:B = "Active")))
```

### B. Dynamic Summary Table with `QUERY` (Google Sheets Native)
The `QUERY` function runs SQL-like syntax directly over sheet ranges:
```excel
=QUERY(Transactions!A1:E1000, "SELECT B, SUM(E) WHERE C = 'Approved' GROUP BY B ORDER BY SUM(E) DESC LABEL SUM(E) 'Total Volume'", 1)
```

### C. Modern `LET` Function for Performance
Avoid recalculating expensive sub-formulas multiple times in a cell:
```excel
=LET(
  rev, B4,
  cogs, B5,
  margin, rev - cogs,
  IF(rev = 0, 0, margin / rev)
)
```

---

## 4. Avoiding Circular Dependencies

Circularity occurs when a cell references itself, directly or indirectly (e.g. Interest Expense depends on Net Debt, which depends on Net Cash, which depends on Net Income, which depends on Interest Expense).

### Rules for Circularity Management:
1. Always design models without circular references when possible.
2. If modeling interest on average debt balances, create an explicit toggle cell (`Assumptions!C15`: `Enable Circular Logic: TRUE/FALSE`).
3. Use `IF(Assumptions!$C$15, Average_Debt_Calculation, Beginning_Debt_Balance)` so the circular loop can be cleanly severed for testing.
