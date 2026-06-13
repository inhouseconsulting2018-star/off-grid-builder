---
name: OffGrid calc engine — rule-of-thumb decision
description: Which solar-sizing philosophy the app uses and why; supersedes the older PVWatts/granular-losses approach.
---

# Calc engine: exact rule-of-thumb (current decision)

The hard-launch pass deliberately moved sizing off granular per-loss stacking
onto a single transparent rule-of-thumb path for all system types: one flat
system derate, panel wattage from admin settings, and peak-sun-hours taken from
the NREL API when reachable, falling back to a per-state value otherwise. The
engine exposes which PSH source was used so the report can disclose it. Off-grid
winter-sizing is now advisory only — it no longer changes array sizing.

**Why:** the product owner wanted simple, defensible numbers a homeowner or
contractor can sanity-check by hand, with honest "estimate, not an engineered
design" disclosure.

**How to apply:** do NOT reintroduce granular per-loss stacking, the old panel
default, or a higher CA PSH "because it's more accurate" — that was an explicit
product call, not an oversight. This supersedes the earlier note that the app
"intentionally uses PVWatts + granular losses." Exact constants live in the
settings table / calculationEngine and are the source of truth; don't duplicate
them here. In dev, NREL is unreachable (see pvwatts-dev-network.md) so the PSH
source is always the fallback — expected, not a bug.
