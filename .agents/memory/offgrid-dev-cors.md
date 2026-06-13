---
name: OffGrid dev CORS — allow Replit preview origins
description: Why the api-server must allow *.replit.dev origins in development, or workspace preview + testing harness break.
---

# Dev CORS must allow Replit preview origins

The api-server CORS allowlist is strict (prod domains + localhost). The frontend
calls the API with a **relative** base (`${BASE_URL}api`), so from the browser it
is same-origin — but the Replit path-based proxy **forwards the browser's preview
`Origin` header** (a `*.replit.dev` / `*.worf.replit.dev` domain) to the API. In
development that origin is not localhost and was not in the allowlist, so
cross-origin POSTs (create project, redeem code) and the Playwright testing
harness got `403 Origin not allowed` ("Blocked CORS origin"), surfacing as a red
"Failed to create project" toast.

**Fix:** `isDevReplitOrigin()` in `artifacts/api-server/src/app.ts` allows origins
matching `/\.(replit\.(dev|app)|repl\.co)$/i` **only when
`env.nodeEnv === "development"`**. The regex is end-anchored, so
`evil-replit.dev.attacker.com` does not match. Production keeps the strict
allowlist (same-origin to offgridsolarbuilder.com).

**Why it matters:** symptom is environment-specific (only in the workspace
preview / test harness, never in prod), so it is easy to misdiagnose as a product
bug. If you see "Blocked CORS origin" in dev, check this gate before touching
frontend code.

**How to apply:** keep any new dev-only origin relaxation gated on
`nodeEnv === "development"` and end-anchored; never widen the production allowlist
to wildcard Replit domains.
