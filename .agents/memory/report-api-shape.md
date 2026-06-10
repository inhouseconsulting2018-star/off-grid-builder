---
name: Paid report API response shape
description: Shape of GET /projects/:id/report when project is paid
---

The paid report endpoint returns a flat object with top-level keys:
{ project, calculation, bom, bomCategories, monthlyChartData, entitlement }

NOT { calculationResult } — that's the raw DB column name.

**Why:** buildPaidReport() in reportService.ts assembles this shape explicitly.
**How to apply:** Frontend and tests should check report.bom (array) and report.calculation (object), not report.calculationResult.
