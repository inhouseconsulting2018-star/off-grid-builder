---
name: OffGrid PDF report gotchas
description: Semantic traps and pagination conventions when editing the paid PDF report generator
---

# OffGrid paid PDF report — gotchas

## `calc.dailyKwh` is daily LOAD, not production
`calc.dailyKwh` = annual usage ÷ 365 (daily **consumption/load**). Daily **production**
is `annualProduction / 365` (higher for an off-grid design). Never label `dailyKwh` as
"Daily Output"/"Daily Production" on a client-facing report — it understates the system.
**Why:** this exact mislabel shipped on the off-grid cover ("Daily Output" → dailyKwh)
and is wrong. The System Overview already calls it "Daily average load" — match that.

## Pagination: no forced page breaks; rely on orphan-prevention
The renderer flows content and lets `ensureSpace`/`sectionHeader` create pages.
- `sectionHeader(title, minFollow)` reserves `22 + minFollow` so a heading never lands
  alone at the bottom of a page. Pass a larger `minFollow` to keep a heading with the
  block that follows it (e.g. Recommended Brands passes `brandCount*18+6`).
- Do **not** call `newContentPage()` to force a section onto a fresh page — that creates
  near-blank orphan pages. A forced break before "Planning Notes" caused a one-row
  orphan page; removing it dropped both sample PDFs from 6 → 5 clean pages.

**How to verify:** render every page to PNG (`pdftoppm -png -r 90`) and eyeball for
blank/orphan pages and clipping — for BOTH grid-tied and off-grid (their BOM and
battery branches paginate differently). tsc alone will not catch layout regressions.
