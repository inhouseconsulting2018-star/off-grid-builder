---
name: OffGrid Solar paywall integration tests
description: Location and scope of the 9 paywall enforcement tests
---

Tests live at `artifacts/api-server/src/__tests__/paywall.test.ts`.
Run with: `node --test artifacts/api-server/src/__tests__/paywall.test.ts`
Env: `API_BASE_URL=http://localhost:8080/api ADMIN_TOKEN=<token>`

Coverage:
1. No token → 404
2. Wrong token → 404
3. Correct token, unpaid → preview fields only (no cost/savings/payback)
4. Unpaid + correct token → /report returns 402
5. No token → /report returns 404
6. Admin token bypasses accessToken check
7. Checkout without token → 404
8. Calculate unpaid → preview fields only
9. /purchases without admin token → 401/503

All 9 pass against the live dev server.

**Why:** Paywall is server-enforced; these tests catch regressions before launch.
