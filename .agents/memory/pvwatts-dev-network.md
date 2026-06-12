---
name: PVWatts always falls back in the dev sandbox
description: Why pvwattsSource is always "fallback" in development even with a valid API key
---

In the Replit dev sandbox, `developer.nrel.gov` does **not resolve** (DNS/egress
restriction): calls fail with `getaddrinfo ENOTFOUND developer.nrel.gov`. Other
hosts (google.com, nominatim.openstreetmap.org) resolve fine, so it is host-specific.

**Consequence:** the solar calc always returns `pvwattsSource: "fallback"` (state-
average PSH, e.g. CA 5.8) in dev, even though `NREL_API_KEY`/`PVWATTS_API_KEY` is
configured and the integration code is correct. The fallback is graceful and intended.

**Why this matters:** do not "fix" the PVWatts code when you see fallback in dev — it
is an environment limitation, not a bug. Real PVWatts irradiance is expected to work
in the deployed (.replit.app) environment. Verify against production logs, not dev.
