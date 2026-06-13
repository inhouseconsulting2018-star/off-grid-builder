---
name: OffGrid dev CORS — allow Replit preview origins
description: Why the api-server must accept *.replit.dev origins in development, or workspace preview + testing harness break.
---

# Dev CORS must allow Replit preview origins

The frontend calls the API with a relative base, so from the browser it is
same-origin — but the Replit path-based proxy forwards the browser's preview
`Origin` (a `*.replit.dev` domain) to the API. The api-server's strict allowlist
(prod domains + localhost) rejected that in development, so cross-origin POSTs
(create project, redeem code) and the Playwright testing harness got
`403 Origin not allowed` ("Blocked CORS origin"), surfacing as a "Failed to
create project" toast.

**Why it matters:** the symptom only appears in the workspace preview / test
harness, never in production (which is same-origin), so it is easy to misdiagnose
as a product bug. If you see "Blocked CORS origin" in dev, this is the cause.

**How to apply:** any dev origin relaxation must stay gated on
`nodeEnv === "development"` and be end-anchored to genuine Replit domains; never
widen the production allowlist to wildcard Replit domains.
