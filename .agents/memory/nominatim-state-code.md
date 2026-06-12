---
name: Nominatim address autocomplete state code
description: Why /geocode/suggest returned empty and how Nominatim exposes US state codes
---

Nominatim (`/search?addressdetails=1`) does **NOT** return an `address.state_code`
field. For US results it returns `address.state` (full name, e.g. "California") plus
`address["ISO3166-2-lvl4"]` (e.g. "US-CA").

**Why this matters:** the suggest endpoint originally filtered and mapped on
`address.state_code`, so every suggestion was discarded → autocomplete silently
returned an empty list while the HTTP call still 200'd. Easy to misdiagnose as a
rate-limit or network issue.

**How to apply:** derive the 2-letter code from `ISO3166-2-lvl4` (split on "-", take
the last segment), not from `state_code`. Do not `.slice(0,2)` the full state name —
that only works by coincidence for a few states (e.g. "California" → "CA", but
"Texas" → "TE").
