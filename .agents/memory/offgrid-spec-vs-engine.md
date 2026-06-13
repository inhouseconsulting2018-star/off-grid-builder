---
name: OffGrid calc engine — rule-of-thumb (hard-launch decision)
description: Which solar sizing formula the app uses and why; supersedes the older PVWatts/granular-losses approach.
---

# Calc engine: exact rule-of-thumb (current, post hard-launch)

The hard-launch pass switched the calculation engine to the **exact rule-of-thumb
formula** for all system types:

- Flat **0.78** system derate (single factor, not granular per-loss stacking).
- Panel wattage from `settings.panelWattage`, **default 440W** (was 400W).
- Peak sun hours (PSH) = **NREL PVWatts API when reachable, else a state fallback**
  (California = **5.5**). The engine emits `solarDataSource` ("api" | "fallback")
  and `pshSourceLabel` so the PDF/report can disclose the source.
- Off-grid winter-sizing logic is now **advisory only** (a note/field), it no
  longer changes array sizing.

**Why:** product owner's hard-launch spec wanted simple, defensible,
transparent numbers a homeowner/contractor can sanity-check by hand, with honest
"estimate / not an engineered design" disclosure.

**How to apply:** Do NOT reintroduce granular per-loss stacking, the old 400W
default, or CA 5.8 PSH. This entry supersedes the previous "intentionally uses
PVWatts + granular losses + CA 5.8 + 400W" note. The 440W default is backfilled
in prod via `lib/db/migrations/003_add_promo_codes.sql`
(`UPDATE settings SET panel_wattage = 440 WHERE panel_wattage = 400`).

Note: in the dev sandbox NREL is unreachable (see pvwatts-dev-network.md), so
`solarDataSource` is always "fallback" in dev — expected, not a bug.
