# Workbook Architecture & Layout Standards

A scalable financial or business workbook is an engineered system. Applying architectural discipline ensures longevity, team collaboration, and audit readiness.

---

## 1. The Standard Tab Structure

A multi-sheet workbook should have a clear left-to-right logical flow:

```
[Index / Cover] -> [Assumptions] -> [Revenue Model] -> [Cost Model] -> [Financial Statements] -> [KPI Dashboard] -> [Audit / Checks]
```

### Tab Naming Guidelines
- Keep tab names under 20 characters.
- Use Title Case: `Income Statement`, `Revenue Build`, `Headcount Schedule`.
- Avoid cryptic abbreviations (e.g. use `Working Capital`, not `WC_sch_v2_final`).
- If referenced in formulas across tabs, avoid special characters (like `/`, `\`, `?`, `*`) that require excessive escaping.

---

## 2. Standard Sheet Grid Layout

Every worksheet in a workbook should share a unified layout geometry:

```
Row 1: Empty breathing buffer (Height: 10px)
Row 2: Sheet Title (Font: 14pt Bold, Navy/Charcoal)
Row 3: Subtitle / Currency & Units notice (e.g. "Values in USD ($) thousands unless noted", 9pt Italic)
Row 4: Empty separator
Row 5: Table Column Headers (Font: 10pt Bold, Filled background, Centered or Left-aligned)
Row 6-N: Data & Formula Rows
Row N+1: Summary / Total Row (Double underline or top border)
```

### Column Width Geometry
- **Column A**: Left margin spacer (Width: 20-30px / 2.5 units). Do not put data in Column A.
- **Column B**: Line Item Descriptions / Labels (Width: 220-280px / 28-35 units).
- **Column C**: Units / Notes / Reference codes (Width: 70-90px / 8-11 units).
- **Columns D-Z**: Numeric Data Columns (Width: Uniform 90-110px across all periods).

---

## 3. Cell Color Coding Conventions (The Universal Financial Standard)

Adhere to the international financial modeling color standard:

| Element Type | Text Color | Fill Color | Border | Meaning |
|---|---|---|---|---|
| **Hardcoded Input** | Navy Blue (`#0000FF`) or Dark Navy | Light Blue Tint (`#E8F0FE`) | Thin border | Numbers typed by hand (assumptions, historicals) |
| **Formula / Calculation** | Black (`#000000`) | Transparent / White | None | Derived dynamically; never edit directly |
| **External Reference** | Dark Green (`#008000`) | Light Green Tint (`#E6F4EA`) | Thin border | Linked from another worksheet or external file |
| **Header Banner** | White (`#FFFFFF`) | Primary Navy (`#1B365D`) | Medium bottom | Category or table header |
| **Total / Subtotal** | Dark Charcoal (`#212529`) | Soft Gray (`#F1F3F5`) | Single top, double bottom | Aggregation rows |
| **Warning / Error Check** | Crimson (`#D93025`) | Light Pink (`#FCE8E6`) | Red border | Failed sanity check or unbalanced condition |
