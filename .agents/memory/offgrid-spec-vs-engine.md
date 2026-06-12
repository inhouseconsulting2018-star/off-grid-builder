---
name: OffGrid simplified spec vs the real calculation engine
description: The deliberate gap between the rule-of-thumb spec and the production solar engine
---

A simplified residential-PV spec exists (Annual Production = kW × PSH × 365 × 0.78;
Required Size = AnnualUsage ÷ PSH ÷ 365 ÷ 0.78; CA fallback PSH 5.5; 440W panels;
panel count = ceil(reqW/440)). The **live paid engine deliberately differs**:

- Production/sizing use a **granular per-loss model** (inverter + wire + shade + temp
  + dirt + mismatch), not a flat ×0.78 derate, and prefer **real NREL PVWatts** output
  when reachable.
- CA fallback PSH is **5.8**, not 5.5.
- Default panel wattage is **400W** (from the settings table, admin-configurable),
  not 440W.
- Panel count uses `Math.ceil` in both (this part already matches).

Net effect example (12,000 kWh/yr, CA, grid-tied): engine ≈ 6.6 kW / ~17 panels;
rule-of-thumb spec ≈ 7.66 kW / 18 panels (~16% larger system).

**Why:** the engine is more accurate and is what paying customers' numbers are based
on. The public **wizard** takes annual kWh only; monthly→annual auto-totaling lives
only in the admin-gated **quick-proposal** flow.

**How to apply:** treat the engine constants as intentional. Do NOT rewrite them to
the rule-of-thumb to "make numbers match the formula" without explicit user sign-off —
it changes every customer-facing number on a deployed paid product.
